const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");
const { Prisma, PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
const { RouteWindowRepository } = require("../dist/services/novel/volume/workspace/routeWindow/infrastructure/RouteWindowRepository.js");
const { buildVolumeWorkspaceDocument } = require("../dist/services/novel/volume/volumeWorkspaceDocument.js");
const { toVolumePlanData, toVolumeChapterPlanData } = require("../dist/services/novel/volume/workspace/infrastructure/VolumeWorkspaceRowMapping.js");
const { appendRouteCandidates, countContinuousRouteWindow } = require("../dist/services/novel/volume/workspace/routeWindow/domain/RouteWindowPolicy.js");

const now = new Date(0).toISOString();
const plan = (order, extra = {}) => ({ id: `p${order}`, volumeId: "v1", chapterOrder: order, beatKey: "open_hook",
  title: `Chapter ${order}`, summary: `Plan ${order}`, payoffRefs: [], createdAt: now, updatedAt: now, ...extra });
const volume = (chapters) => ({ id: "v1", novelId: "n1", sortOrder: 1, title: "Original volume",
  openingHook: "version-only hook", openPayoffs: ["original payoff"], status: "active", chapters, createdAt: now, updatedAt: now });
function document(chapters = [plan(1)], extra = {}) {
  const result = buildVolumeWorkspaceDocument({ novelId: "n1", volumes: [volume(chapters)], beatSheets: [{
    volumeId: "v1", volumeSortOrder: 1, status: "generated", beats: [{ key: "open_hook", label: "Opening", summary: "Original beat", chapterSpanHint: "1-4章", mustDeliver: ["original"] }],
  }], ...extra });
  return result;
}

// Only six owned disposable tables, built from the installed Prisma scalar contract. No app DB/config import.
async function fixture(work, { seed = document([plan(1, { chapterId: "c1", taskSheet: "saved contract", styleContract: "version-only style" })]) , existingChapter = true } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "novelfoundry-route-append-"));
  const file = path.join(directory, "fixture.sqlite");
  const sqlite = new Database(file);
  for (const name of ["Novel", "VolumePlan", "VolumeChapterPlan", "VolumePlanVersion", "Chapter", "StoryPlan"]) {
    const model = Prisma.dmmf.datamodel.models.find(item => item.name === name);
    const columns = model.fields.filter(field => field.kind !== "object").map(field => {
      const type = ["Int", "Boolean", "BigInt"].includes(field.type) ? "INTEGER" : field.type === "Float" ? "REAL" : "TEXT";
      return `"${field.name}" ${type}${field.isId ? " PRIMARY KEY" : ""}`;
    });
    sqlite.exec(`CREATE TABLE "${name}" (${columns.join(",")})`);
  }
  sqlite.exec('CREATE UNIQUE INDEX route_volume_order ON VolumePlan(novelId,sortOrder); CREATE UNIQUE INDEX route_plan_order ON VolumeChapterPlan(volumeId,chapterOrder); CREATE UNIQUE INDEX route_version_order ON VolumePlanVersion(novelId,version);');
  sqlite.close();
  const raw = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${file}`, timeout: 50 }) });
  const ensureVersion = async (tx, novelId, next) => {
    const current = await tx.volumePlanVersion.findFirst({ where: { novelId, status: "active" } });
    const version = current ?? await tx.volumePlanVersion.create({ data: { novelId, version: 1, status: "active", contentJson: "{}" } });
    await tx.volumePlanVersion.update({ where: { id: version.id }, data: { contentJson: JSON.stringify({ ...next, activeVersionId: version.id, source: "volume" }) } });
    return { versionId: version.id };
  };
  const repository = new RouteWindowRepository({ db: raw, transaction: fn => raw.$transaction(fn), ensureVersion });
  try {
    const stamp = new Date();
    await raw.$executeRaw`INSERT INTO Novel (id,title,outlineStatus,storylineStatus,updatedAt,createdAt) VALUES ('n1','Fixture','in_progress','in_progress',${stamp},${stamp})`;
    if (existingChapter) await raw.$executeRaw`INSERT INTO Chapter (id,novelId,"order",title,content,generationState,chapterStatus,taskSheet,sceneCards,updatedAt,createdAt) VALUES ('c1','n1',1,'Author title','usable author prose','approved','completed','author task sheet','author scene cards',${stamp},${stamp})`;
    if (seed) {
      const version = await raw.volumePlanVersion.create({ data: { novelId: "n1", version: 1, status: "active", contentJson: JSON.stringify(seed) } });
      for (const item of seed.volumes) {
        await raw.volumePlan.create({ data: toVolumePlanData("n1", item, version.id) });
        for (const chapter of item.chapters) await raw.volumeChapterPlan.create({ data: toVolumeChapterPlanData(item.id, chapter) });
      }
    }
    await work({ raw, repository, file });
  } finally {
    await raw.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

const savedProse = (raw) => raw.chapter.findUnique({ where: { id: "c1" }, select: { content: true, title: true, taskSheet: true, sceneCards: true, generationState: true, chapterStatus: true } });

test("route append creates only missing rows and preserves saved contracts, prose and version-only fields", () => fixture(async ({ raw, repository }) => {
  const baseline = await repository.read("n1");
  const beforeProse = await savedProse(raw);
  const beforePlan = await raw.volumeChapterPlan.findUnique({ where: { id: "p1" } });
  const generated = structuredClone(baseline.document);
  Object.assign(generated.volumes[0], { title: "unwanted rewrite", openingHook: "unwanted hook" });
  Object.assign(generated.volumes[0].chapters[0], { title: "unwanted chapter", taskSheet: null, styleContract: null });
  generated.volumes[0].chapters.push(plan(2));
  generated.beatSheets[0].beats[0].summary = "unwanted beat rewrite";
  const result = await repository.append("n1", generated, baseline);
  assert.deepEqual(await savedProse(raw), beforeProse);
  assert.deepEqual(await raw.volumeChapterPlan.findUnique({ where: { id: "p1" } }), beforePlan);
  assert.equal(result.document.volumes[0].title, "Original volume");
  assert.equal(result.document.volumes[0].openingHook, "version-only hook");
  assert.equal(result.document.volumes[0].chapters[0].styleContract, "version-only style");
  assert.equal(result.document.beatSheets[0].beats[0].summary, "Original beat");
  assert.equal(await raw.chapter.count(), 2);
  assert.equal(countContinuousRouteWindow(result.document, await raw.chapter.findMany({ select: { id: true, order: true } }), 1), 2);
  const repeated = await repository.append("n1", generated, baseline);
  assert.equal(repeated.document.volumes[0].chapters.length, 2);
  assert.equal(await raw.chapter.count(), 2);
}));

test("active-version no-op materialization returns a usable revision for the next append", () => fixture(async ({ raw, repository }) => {
  const before = await repository.read("n1");
  const ready = await repository.append("n1", before.document, before);
  const generated = structuredClone(ready.document); generated.volumes[0].chapters.push(plan(2));
  const after = await repository.append("n1", generated, ready);
  assert.equal(after.document.volumes[0].chapters.length, 2);
  assert.equal(await raw.chapter.count(), 2);
}));

test("saved plans rebuild missing execution rows including old links without changing existing prose", () => fixture(async ({ raw, repository }) => {
  const before = await savedProse(raw);
  const baseline = await repository.read("n1");
  const after = await repository.append("n1", baseline.document, baseline);
  const rebuilt = await raw.chapter.findUnique({ where: { id: "rebuild-c2" }, select: { content: true, taskSheet: true, order: true } });
  assert.deepEqual(rebuilt, { content: "", taskSheet: "saved second contract", order: 2 });
  assert.deepEqual(await savedProse(raw), before);
  assert.equal(countContinuousRouteWindow(after.document, await raw.chapter.findMany({ select: { id: true, order: true } }), 1), 2);
}, { seed: document([plan(1, { chapterId: "c1" }), plan(2, { chapterId: "rebuild-c2", taskSheet: "saved second contract" })]) }));

test("stale generated additions cannot overwrite a later saved planning revision", () => fixture(async ({ raw, repository }) => {
  const old = await repository.read("n1");
  const generated = structuredClone(old.document); generated.volumes[0].chapters.push(plan(2));
  const current = structuredClone(old.document); current.volumes[0].chapters[0].exclusiveEvent = "new author event";
  await raw.volumePlanVersion.updateMany({ where: { novelId: "n1" }, data: { contentJson: JSON.stringify(current) } });
  await assert.rejects(repository.append("n1", generated, old), /有新修改/);
  assert.equal(await raw.chapter.count(), 1);
  assert.equal((await repository.read("n1")).document.volumes[0].chapters[0].exclusiveEvent, "new author event");
}));

test("link conflicts roll back all earlier missing execution rows in the same append", () => fixture(async ({ raw, repository }) => {
  const baseline = await repository.read("n1");
  const generated = structuredClone(baseline.document);
  generated.volumes[0].chapters.push(plan(2), plan(3, { chapterId: "c1" }));
  await assert.rejects(repository.append("n1", generated, baseline), /相同正文|其他正文位置/);
  assert.equal(await raw.chapter.count(), 1);
  assert.equal(await raw.volumeChapterPlan.count(), 1);
}));

test("book-end clipping preserves saved later planning and never creates new execution beyond the book", () => fixture(async ({ raw, repository }) => {
  const baseline = await repository.read("n1");
  const generated = structuredClone(baseline.document); generated.volumes[0].chapters.push(plan(2), plan(3));
  const after = await repository.append("n1", generated, baseline, { endOrder: 2 });
  assert.equal(await raw.chapter.count(), 2);
  assert.deepEqual(after.document.volumes[0].chapters.map(item => item.chapterOrder), [1, 2]);
}));

test("append transaction serializes a competing connection before reading planning facts", () => fixture(async ({ raw, repository, file }) => {
  const before = await repository.read("n1");
  let raceError;
  const original = repository.deps.transaction;
  repository.deps.transaction = fn => original(async tx => {
    const update = tx.novel.updateMany.bind(tx.novel);
    tx.novel.updateMany = async args => {
      const value = await update(args);
      const other = new Database(file, { timeout: 10 });
      try { other.prepare("UPDATE VolumePlan SET title = 'competing edit' WHERE id = 'v1'").run(); }
      catch (error) { raceError = error; }
      finally { other.close(); }
      return value;
    };
    return fn(tx);
  });
  const generated = structuredClone(before.document); generated.volumes[0].chapters.push(plan(2));
  await repository.append("n1", generated, before);
  assert.equal(raceError?.code, "SQLITE_BUSY");
  assert.equal((await repository.read("n1")).document.volumes[0].title, "Original volume");
}));

test("continuous windows stop at the first missing planned or execution order and enforce links", () => {
  const planned = document([plan(1), plan(2), plan(3)]);
  assert.equal(countContinuousRouteWindow(planned, [{ id: "c1", order: 1 }, { id: "c3", order: 3 }], 1), 1);
  assert.equal(countContinuousRouteWindow(document([plan(1), plan(3)]), [{ id: "c1", order: 1 }, { id: "c2", order: 2 }, { id: "c3", order: 3 }], 1), 1);
  assert.equal(countContinuousRouteWindow(planned, [{ id: "c2", order: 2 }, { id: "c3", order: 3 }], 2, 2), 1);
  assert.throws(() => countContinuousRouteWindow(planned, [{ id: "a", order: 1 }, { id: "b", order: 1 }], 1), /重复章序/);
  assert.throws(() => countContinuousRouteWindow(document([plan(1, { chapterId: "saved" })]), [{ id: "other", order: 1 }], 1), /关联不一致/);
});

test("route identity and beat conflicts fail before draft normalization can move identities", () => {
  const saved = document();
  const cases = [
    next => { next.novelId = "other"; },
    next => { next.volumes[0].chapters.push(plan(1, { id: "different" })); },
    next => { next.volumes[0].chapters[0].chapterOrder = 2; },
    next => { next.volumes[0].chapters.push(plan(2, { id: "p1" })); },
    next => { next.beatSheets[0].beats.push(next.beatSheets[0].beats[0]); },
    next => { next.beatSheets[0].volumeId = "missing"; },
    next => { next.volumes.push({ ...next.volumes[0], id: "v2", chapters: [] }); },
  ];
  for (const mutate of cases) {
    const candidate = structuredClone(saved); mutate(candidate);
    assert.throws(() => appendRouteCandidates(saved, candidate), /冲突|移动|关联|当前小说|重复/);
  }
  assert.deepEqual(saved, document());
});


test("late persistence failure rolls back newly reconstructed rows and preserves the saved version", () => fixture(async ({ raw, repository }) => {
  const baseline = await repository.read("n1");
  const generated = structuredClone(baseline.document); generated.volumes[0].chapters.push(plan(2));
  const before = await raw.volumePlanVersion.findFirst({ where: { novelId: "n1" } });
  repository.deps.ensureVersion = async () => { throw new Error("late persistence failure"); };
  await assert.rejects(repository.append("n1", generated, baseline), /late persistence failure/);
  assert.equal(await raw.chapter.count(), 1);
  assert.equal(await raw.volumeChapterPlan.count(), 1);
  assert.equal((await raw.volumePlanVersion.findFirst({ where: { novelId: "n1" } })).contentJson, before.contentJson);
}));


test("saved later plans remain intact while new execution is bounded by the book end", () => fixture(async ({ raw, repository }) => {
  const baseline = await repository.read("n1");
  const generated = structuredClone(baseline.document); generated.volumes[0].chapters.push(plan(2));
  const after = await repository.append("n1", generated, baseline, { endOrder: 2 });
  assert.deepEqual(after.document.volumes[0].chapters.map(item => item.chapterOrder), [1, 2, 3]);
  assert.deepEqual((await raw.chapter.findMany({ select: { order: true }, orderBy: { order: "asc" } })).map(item => item.order), [1, 2]);
}, { seed: document([plan(1, { chapterId: "c1" }), plan(3, { taskSheet: "saved later contract" })]) }));

test("malformed saved duplicate chapter orders fail instead of being silently renumbered", () => fixture(async ({ raw, repository }) => {
  const baseline = await repository.read("n1");
  const invalid = structuredClone(baseline.document); invalid.volumes[0].chapters.push(plan(1, { id: "duplicate-order" }));
  await raw.volumePlanVersion.updateMany({ where: { novelId: "n1" }, data: { contentJson: JSON.stringify(invalid) } });
  await assert.rejects(repository.read("n1"), /章序冲突/);
  assert.equal(await raw.volumeChapterPlan.count(), 1);
}));

test("books with no active version use the same append transaction to establish their first saved plan", () => fixture(async ({ raw, repository }) => {
  const baseline = await repository.read("n1");
  assert.equal(baseline.document.activeVersionId, null);
  const result = await repository.append("n1", document([plan(1), plan(2)]), baseline);
  assert.ok(result.document.activeVersionId);
  assert.equal(await raw.volumePlanVersion.count({ where: { status: "active" } }), 1);
  assert.equal(await raw.volumeChapterPlan.count(), 2);
  assert.equal(await raw.chapter.count(), 2);
}, { seed: null, existingChapter: false }));


test("legacy-only books expose stable read-only route snapshots and materialize atomically on append", () => fixture(async ({ raw, repository }) => {
  await raw.chapter.update({ where: { id: "c1" }, data: { expectation: "Legacy saved chapter" } });
  await raw.novel.update({ where: { id: "n1" }, data: { outline: "Legacy outline" } });
  const first = await repository.read("n1"), second = await repository.read("n1");
  assert.equal(first.document.source, "legacy");
  assert.equal(first.revision, second.revision);
  assert.deepEqual(first.document, second.document);
  assert.equal(await raw.volumePlan.count(), 0);
  assert.equal(await raw.volumePlanVersion.count(), 0);
  const before = await savedProse(raw);
  const saved = await repository.append("n1", first.document, first);
  assert.equal(saved.document.source, "volume");
  assert.equal(await raw.volumePlan.count(), 1);
  assert.equal(await raw.volumeChapterPlan.count(), 1);
  assert.deepEqual(await savedProse(raw), before);
}, { seed: null }));

test("legacy source revisions fence stale candidate additions without initializing a workspace", () => fixture(async ({ raw, repository }) => {
  await raw.chapter.update({ where: { id: "c1" }, data: { expectation: "Legacy saved chapter" } });
  await raw.novel.update({ where: { id: "n1" }, data: { outline: "Legacy outline" } });
  const old = await repository.read("n1");
  const proposed = structuredClone(old.document);
  const volumeId = proposed.volumes[0].id;
  proposed.volumes[0].chapters.push(plan(2, { id: "legacy-addition", volumeId }));
  await raw.novel.update({ where: { id: "n1" }, data: { outline: "Newer legacy outline" } });
  await assert.rejects(repository.append("n1", proposed, old), /冲突|有新修改/);
  assert.equal(await raw.volumePlan.count(), 0);
  assert.equal(await raw.volumePlanVersion.count(), 0);
  assert.equal(await raw.chapter.count(), 1);
}, { seed: null }));
