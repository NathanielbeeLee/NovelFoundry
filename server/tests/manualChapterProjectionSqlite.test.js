const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");
const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
const { buildContentHash } = require("../dist/services/novel/artifacts/domain/ChapterSourceIdentity.js");
const { invalidateManualChapterProjections } = require("../dist/services/novel/artifacts/infrastructure/ManualChapterProjectionInvalidation.js");

function sourceScope(raw) {
  const adapter = require.resolve("../dist/modules/novel/quality/polishPersistence.js");
  const source = require.resolve("../dist/services/novel/artifacts/infrastructure/ChapterSourceTransaction.js");
  const saved = new Map([adapter, source].map((name) => [name, require.cache[name]]));
  try {
    require.cache[adapter] = { exports: { polishPrisma: raw } };
    delete require.cache[source];
    return require(source);
  } finally {
    for (const [name, previous] of saved) {
      if (previous) require.cache[name] = previous;
      else delete require.cache[name];
    }
  }
}

// Disposable minimal tables for the real Prisma operations under test, no app DB/config.
async function fixture(run, { legacyTimestamp = false } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "novelfoundry-manual-projection-"));
  const file = path.join(directory, "fixture.sqlite");
  const sqlite = new Database(file);
  sqlite.exec(`
    CREATE TABLE Chapter (id TEXT PRIMARY KEY, novelId TEXT, content TEXT, updatedAt DATETIME);
    CREATE TABLE ChapterSummary (id TEXT PRIMARY KEY, novelId TEXT, chapterId TEXT, sourceContentHash TEXT, updatedAt DATETIME);
    CREATE TABLE ConsistencyFact (id TEXT PRIMARY KEY, novelId TEXT, chapterId TEXT, source TEXT);
    CREATE TABLE CharacterTimeline (id TEXT PRIMARY KEY, novelId TEXT, chapterId TEXT, source TEXT);
    CREATE TABLE KnowledgeChunk (id TEXT PRIMARY KEY, novelId TEXT, ownerType TEXT, ownerId TEXT);
    INSERT INTO ConsistencyFact VALUES ('fact-auto','n1','c1','chapter_auto_extract'), ('fact-manual','n1','c1','manual');
    INSERT INTO CharacterTimeline VALUES ('timeline-auto','n1','c1','chapter_extract'), ('timeline-manual','n1','c1','manual');
    INSERT INTO KnowledgeChunk VALUES ('chunk-auto','n1','consistency_fact','fact-auto'), ('chunk-manual','n1','consistency_fact','fact-manual');
  `);
  sqlite.close();
  const raw = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${file}`, timeout: 150 }) });
  try {
    const now = new Date();
    const storedTime = legacyTimestamp ? now.getTime() : now;
    const hash = buildContentHash("current prose");
    await raw.$executeRaw`INSERT INTO Chapter VALUES ('c1','n1','current prose',${storedTime})`;
    await raw.$executeRaw`INSERT INTO ChapterSummary VALUES ('summary','n1','c1',${hash},${now})`;
    const scope = sourceScope(raw);
    await run({ raw, file, scope, identity: { novelId: "n1", chapterId: "c1", contentHash: hash } });
  } finally {
    await raw.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

const factIds = async (raw) => (await raw.consistencyFact.findMany({ select: { id: true }, orderBy: { id: "asc" } })).map((row) => row.id);
const summaryHash = async (raw) => (await raw.chapterSummary.findFirst({ select: { sourceContentHash: true } })).sourceContentHash;

test("real SQLite: stale source cannot invalidate a newer chapter's projections", () => fixture(async ({ raw, scope, identity }) => {
  let entered = false;
  await assert.rejects(scope.runWithChapterSource({ ...identity, contentHash: buildContentHash("old prose") }, async () => {
    entered = true;
    await invalidateManualChapterProjections(scope.artifactPrisma, "n1", "c1");
  }), scope.StaleChapterSourceError);
  assert.equal(entered, false);
  assert.deepEqual(await factIds(raw), ["fact-auto", "fact-manual"]);
  assert.equal(await summaryHash(raw), identity.contentHash);
}));

test("real SQLite: source-locked invalidation preserves authored rows and their index metadata", () => fixture(async ({ raw, scope, identity }) => {
  await scope.runWithChapterSource(identity, () => invalidateManualChapterProjections(scope.artifactPrisma, "n1", "c1"));
  assert.deepEqual(await factIds(raw), ["fact-manual"]);
  assert.deepEqual(await raw.characterTimeline.findMany({ select: { id: true } }), [{ id: "timeline-manual" }]);
  assert.deepEqual(await raw.knowledgeChunk.findMany({ select: { id: true } }), [{ id: "chunk-manual" }]);
  assert.equal(await summaryHash(raw), null);
}));

test("real SQLite: failed follow-up rolls back invalidation and summary freshness together", () => fixture(async ({ raw, scope, identity }) => {
  await assert.rejects(scope.runWithChapterSource(identity, async () => {
    await invalidateManualChapterProjections(scope.artifactPrisma, "n1", "c1");
    throw new Error("late write failure");
  }), /late write failure/);
  assert.deepEqual(await factIds(raw), ["fact-auto", "fact-manual"]);
  assert.equal(await raw.knowledgeChunk.count(), 2);
  assert.equal(await summaryHash(raw), identity.contentHash);
}));

test("real SQLite: chapter lock prevents another connection from changing source during projection writes", () => fixture(async ({ raw, file, scope, identity }) => {
  let competingError;
  await scope.runWithChapterSource(identity, async () => {
    const other = new Database(file, { timeout: 20 });
    try { other.prepare("UPDATE Chapter SET content = ? WHERE id = ?").run("competing prose", "c1"); }
    catch (error) { competingError = error; }
    finally { other.close(); }
    await invalidateManualChapterProjections(scope.artifactPrisma, "n1", "c1");
  });
  assert.equal(competingError?.code, "SQLITE_BUSY");
  assert.equal((await raw.chapter.findFirst({ select: { content: true } })).content, "current prose");
  assert.deepEqual(await factIds(raw), ["fact-manual"]);
}));

test("real SQLite: legacy epoch timestamps retain source locks and revision guards", () => fixture(async ({ raw, scope, identity }) => {
  const current = await raw.chapter.findFirst({ select: { updatedAt: true } });
  await scope.runWithChapterSource({ ...identity, expectedUpdatedAt: current.updatedAt },
    () => invalidateManualChapterProjections(scope.artifactPrisma, "n1", "c1"));
  assert.deepEqual(await factIds(raw), ["fact-manual"]);
  assert.equal((await raw.chapter.findFirst({ select: { updatedAt: true } })).updatedAt.getTime(), current.updatedAt.getTime());
  await assert.rejects(scope.runWithChapterSource({ ...identity, expectedUpdatedAt: new Date(0) }, async () => {
    throw new Error("stale metadata must not enter persistence");
  }), scope.StaleChapterSourceError);
}, { legacyTimestamp: true }));
