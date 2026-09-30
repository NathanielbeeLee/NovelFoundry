const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { Prisma } = require("@prisma/client");

let tables; let failWrite; let backupHook; let backupCalls;
const copy = (value) => structuredClone(value);
const rows = (model) => tables[model] ??= [];
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === "OR") return value.some((item) => matches(row, item));
    if (key === "AND") return (Array.isArray(value) ? value : [value]).every((item) => matches(row, item));
    if (key === "snapshot") return matches(rows("storyStateSnapshot").find((item) => item.id === row.snapshotId) ?? {}, value);
    if (key === "report") return matches(rows("auditReport").find((item) => item.id === row.reportId) ?? {}, value);
    if (key === "plan") return matches(rows("storyPlan").find((item) => item.id === row.planId) ?? {}, value);
    if (value instanceof Date) return row[key] instanceof Date && +row[key] === +value;
    if (value && typeof value === "object") {
      if ("in" in value) return value.in.includes(row[key]);
      if ("not" in value) return row[key] !== value.not;
      if (!(key in row)) return matches(row, value);
    }
    return row[key] === value;
  });
}
const delegate = (model) => ({
  findMany: async (args = {}) => {
    let result = rows(model).filter((row) => matches(row, args.where));
    const orderBy = Array.isArray(args.orderBy) ? args.orderBy[0] : args.orderBy;
    if (orderBy) { const [key, direction] = Object.entries(orderBy)[0]; result = [...result].sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * (direction === "desc" ? -1 : 1)); }
    result = result.slice(0, args.take ?? result.length);
    return result.map((row) => {
      const value = copy(row);
      if (args.include?.chapter) value.chapter = copy(rows("chapter").find((item) => item.id === row.chapterId));
      if (args.include?.mutations) value.mutations = copy(rows("chapterPolishMutation").filter((item) => item.revisionId === row.id).sort((a,b) => a.sequence-b.sequence));
      return value;
    });
  },
  findFirst: async (args = {}) => (await fake[model].findMany(args))[0] ?? null,
  findUnique: async (args = {}) => (await fake[model].findMany(args))[0] ?? null,
  count: async (args = {}) => (await fake[model].findMany(args)).length,
  create: async ({ data }) => {
    failWrite?.(model, "create", data);
    const value = { id: randomUUID(), createdAt: new Date("2026-09-11T01:00:00Z"), ...copy(data) };
    if (model === "chapterPolishRevision") Object.assign(value, { status: data.status ?? "recording", backupVerified: false, afterChapterStateJson: null, afterContent: null, afterRawHash: null, undoneAt: null });
    rows(model).push(value); return copy(value);
  },
  createMany: async ({ data }) => { for (const row of data) await fake[model].create({ data: row }); return { count: data.length }; },
  updateMany: async ({ where, data }) => { failWrite?.(model, "updateMany", data); let count = 0; for (const row of rows(model).filter((item) => matches(item, where))) { Object.assign(row, copy(data)); count++; } return { count }; },
  update: async ({ where, data }) => { const result = await fake[model].updateMany({ where, data }); if (result.count !== 1) throw new Error("missing row"); return fake[model].findUnique({ where: { id: where.id } }); },
  upsert: async ({ where, create, update }) => { const exists = await fake[model].findFirst({ where }); return exists ? fake[model].update({ where: { id: exists.id }, data: update }) : fake[model].create({ data: create }); },
  deleteMany: async ({ where }) => { failWrite?.(model, "deleteMany", where); const selected = rows(model).filter((row) => matches(row, where)); tables[model] = rows(model).filter((row) => !selected.includes(row)); return { count: selected.length }; },
});
const fake = new Proxy({
  $transaction: async (run) => { const before = copy(tables); try { return await run(fake); } catch (error) { tables = before; throw error; } },
  $executeRaw: async () => { throw new Error("raw reached database"); },
}, { get(target, key) { if (key in target) return target[key]; return target[key] = delegate(key); } });

const prismaPath = require.resolve("../dist/db/prisma.js");
require.cache[prismaPath] = { id: prismaPath, filename: prismaPath, loaded: true, exports: { prisma: fake } };
const backupPath = require.resolve("../dist/modules/novel/export/backup/index.js");
require.cache[backupPath] = { id: backupPath, filename: backupPath, loaded: true, exports: { createVerifiedNovelBackup: async () => { backupCalls++; await backupHook?.(); return { backupId: "backup", path: "/verified/backup.json", bytes: 42, digest: "hash", schemaVersion: 1 }; } } };
const { withPolishRevision } = require("../dist/modules/novel/quality/application/polish/PolishExecutionScope.js");
const { PolishRevisionService } = require("../dist/modules/novel/quality/application/polish/PolishRevisionService.js");
const { polishPrisma, runInPolishScope } = require("../dist/modules/novel/quality/polishPersistence.js");
const { ChapterLifecycleService } = require("../dist/services/novel/runtime/lifecycle/index.js");
const { artifactPrisma, runWithChapterSource, buildContentHash } = require("../dist/services/novel/artifacts/persistence.js");
const lifecycle = new ChapterLifecycleService();
const service = new PolishRevisionService();

function reset() {
  tables = {}; failWrite = null; backupHook = null; backupCalls = 0;
  rows("chapter").push({ id: "c1", novelId: "n1", content: "润色前", title: "第一章", order: 1, chapterStatus: "completed", generationState: "approved", updatedAt: new Date("2026-09-10T00:00:00Z") }, { id: "c2", novelId: "n1", content: "其他章节", order: 2, chapterStatus: "completed" });
  rows("character").push({ id: "hero", novelId: "n1", currentState: "旧状态" });
  rows("chapterSummary").push({ id: "summary", novelId: "n1", chapterId: "c1", summary: "旧摘要", sourceContentHash: buildContentHash("润色前") });
}
async function runPolish(extra) {
  await withPolishRevision({ enabled: true, novelId: "n1", chapterId: "c1", jobId: "job" }, async () => {
    await lifecycle.saveWorkingContent({ novelId: "n1", chapterId: "c1", content: "润色后", generationState: "repaired" });
    await runWithChapterSource({ novelId: "n1", chapterId: "c1", contentHash: buildContentHash("润色后") }, async () => {
      await artifactPrisma.character.update({ where: { id: "hero" }, data: { currentState: "新状态" } });
      await artifactPrisma.chapterSummary.update({ where: { id: "summary" }, data: { summary: "新摘要", sourceContentHash: buildContentHash("润色后") } });
    });
    await extra?.();
    await lifecycle.markChapterStatus("c1", "pending_review");
  });
  return rows("chapterPolishRevision")[0];
}

test("actual lifecycle + artifact source transactions record and safely undo complete chapter state", async () => {
  reset(); const original = copy(tables); const revision = await runPolish();
  assert.ok(rows("chapterPolishMutation").length >= 4);
  assert.equal((await service.detail("n1", revision.id)).undoEligibility.allowed, true);
  const result = await service.undo("n1", revision.id, revision.afterRawHash);
  assert.equal(result.status, "undone"); assert.equal(backupCalls, 1);
  assert.deepEqual(rows("chapter"), original.chapter); assert.deepEqual(rows("character"), original.character); assert.deepEqual(rows("chapterSummary"), original.chapterSummary);
  assert.equal(rows("chapterPolishRevision")[0].status, "undone"); assert.ok(rows("ragIndexJob").length > 0);
  await service.undo("n1", revision.id, revision.afterRawHash); assert.equal(backupCalls, 1);
});

test("raw whitespace author edits are conflicts, without requesting a backup", async () => {
  reset(); const revision = await runPolish(); rows("chapter")[0].content += " ";
  await assert.rejects(service.undo("n1", revision.id, revision.afterRawHash), /后续修改/);
  assert.equal(backupCalls, 0); assert.equal(rows("chapter")[0].content, "润色后 ");
});

test("later character state changes prevent any inverse write", async () => {
  reset(); const revision = await runPolish(); rows("character")[0].currentState = "后文状态";
  assert.equal((await service.detail("n1", revision.id)).undoEligibility.reason, "derived_state_changed");
  await assert.rejects(service.undo("n1", revision.id, revision.afterRawHash));
  assert.equal(rows("chapter")[0].content, "润色后");
});

test("journal persistence failure rolls back the content save", async () => {
  reset(); failWrite = (model) => { if (model === "chapterPolishMutation") throw new Error("journal unavailable"); };
  await assert.rejects(runPolish(), /journal unavailable/);
  assert.equal(rows("chapter")[0].content, "润色前"); assert.equal(rows("chapterPolishMutation").length, 0);
  assert.equal(JSON.parse(rows("chapterPolishRevision")[0].afterChapterStateJson).captureComplete, false);
});

test("failure during inverse sequence rolls back all earlier inverses", async () => {
  reset(); const revision = await runPolish(); const before = copy(tables);
  failWrite = (model, method, data) => { if (model === "chapter" && method === "updateMany" && data.content === "润色前") throw new Error("inverse persistence unavailable"); };
  await assert.rejects(service.undo("n1", revision.id, revision.afterRawHash), /inverse persistence/);
  for (const [model, state] of Object.entries(before)) assert.deepEqual(rows(model), state);
});

test("content changed during backup is checked again inside inverse transaction", async () => {
  reset(); const revision = await runPolish(); backupHook = async () => { rows("chapter")[0].content = "备份期间编辑"; };
  await assert.rejects(service.undo("n1", revision.id, revision.afterRawHash));
  assert.equal(rows("chapter")[0].content, "备份期间编辑"); assert.equal(backupCalls, 1);
});

test("intervening external edit between two journal transactions fails the entire inverse chain", async () => {
  reset(); const revision = await runPolish(async () => {
    await fake.character.update({ where: { id: "hero" }, data: { currentState: "外部中间修改" } });
    await polishPrisma.character.update({ where: { id: "hero" }, data: { currentState: "本次最终状态" } });
  });
  await assert.rejects(service.undo("n1", revision.id, revision.afterRawHash));
  assert.equal(rows("chapter")[0].content, "润色后"); assert.equal(rows("character")[0].currentState, "本次最终状态");
});

test("later inbound FK reference blocks deletion of an entity created by polishing", async () => {
  reset(); let snapshot;
  const revision = await runPolish(async () => { snapshot = await polishPrisma.storyStateSnapshot.create({ data: { novelId: "n1", sourceChapterId: "c1" } }); });
  rows("openConflict").push({ id: "later", novelId: "n1", sourceSnapshotId: snapshot.id });
  await assert.rejects(service.undo("n1", revision.id, revision.afterRawHash));
  assert.equal(rows("openConflict").length, 1); assert.equal(rows("storyStateSnapshot").length, 1);
});

test("created rows without later references can be removed by inverse journal", async () => {
  reset(); const revision = await runPolish(async () => { await polishPrisma.storyStateSnapshot.create({ data: { novelId: "n1", sourceChapterId: "c1" } }); });
  await service.undo("n1", revision.id, revision.afterRawHash);
  assert.equal(rows("storyStateSnapshot").length, 0);
});

test("raw client calls and swallowed unsupported writes mark capture incomplete", async () => {
  reset(); const active = { revisionId: "r", novelId: "n1", chapterId: "c1", expectedContent: "润色前", nextSequence: 1, closed: false };
  await runInPolishScope(active, async () => { assert.throws(() => polishPrisma.$executeRaw, /does not allow/); });
  assert.match(active.failure, /does not allow/);
});

test("old background extraction is rejected after a successful undo", async () => {
  reset(); const revision = await runPolish(); await service.undo("n1", revision.id, revision.afterRawHash);
  await assert.rejects(runWithChapterSource({ novelId: "n1", chapterId: "c1", contentHash: buildContentHash("润色后") }, async () => { throw new Error("must not execute"); }), /旧正文/);
});

test("imported history remains readable and cannot execute undo", async () => {
  reset(); const revision = await runPolish(); revision.afterChapterStateJson = JSON.stringify({ version: 1, captureComplete: false, reason: "imported_readonly" });
  const detail = await service.detail("n1", revision.id); assert.equal(detail.beforeContent, "润色前"); assert.equal(detail.undoEligibility.allowed, false);
  await assert.rejects(service.undo("n1", revision.id, revision.afterRawHash)); assert.equal(backupCalls, 0);
});

test("JSON timeline soft references prevent deleting a polished event used later", async () => {
  reset(); let event;
  const revision = await runPolish(async () => { event = await polishPrisma.storyTimelineEvent.create({ data: { novelId: "n1", chapterId: "c1", title: "新事件" } }); });
  rows("timelineConstraint").push({ id: "later-constraint", novelId: "n1", relatedEventIdsJson: JSON.stringify([event.id]) });
  await assert.rejects(service.undo("n1", revision.id, revision.afterRawHash));
  assert.equal(rows("timelineConstraint").length, 1); assert.equal(rows("storyTimelineEvent").length, 1);
});

test("running index job blocks undo; queued old jobs and metadata are atomically invalidated", async () => {
  reset(); const revision = await runPolish();
  rows("ragIndexJob").push({ id: "old-job", ownerType: "chapter", ownerId: "c1", status: "running" });
  await assert.rejects(service.undo("n1", revision.id, revision.afterRawHash));
  assert.equal(rows("chapter")[0].content, "润色后");
  rows("ragIndexJob")[0].status = "queued";
  rows("knowledgeChunk").push({ id: "old-chunk", ownerType: "chapter", ownerId: "c1" }, { id: "other", ownerType: "chapter", ownerId: "c2" });
  await service.undo("n1", revision.id, revision.afterRawHash);
  assert.equal(rows("ragIndexJob").find((job) => job.id === "old-job").status, "cancelled");
  assert.deepEqual(rows("knowledgeChunk").map((chunk) => chunk.id), ["other"]);
});

test("no active scope preserves ordinary Prisma entrypoints and adds no revision", async () => {
  reset(); await lifecycle.saveWorkingContent({ novelId: "n1", chapterId: "c1", content: "普通编辑", generationState: "drafted" });
  assert.equal(rows("chapter")[0].content, "普通编辑"); assert.equal(rows("chapterPolishRevision").length, 0);
});

test("runtime failure after fully journaled writes retains a reversible partial result", async () => {
  reset(); await assert.rejects(runPolish(async () => { throw new Error("review transport failed"); }), /review transport failed/);
  const revision = rows("chapterPolishRevision")[0];
  assert.equal(revision.status, "failed"); assert.equal(JSON.parse(revision.afterChapterStateJson).captureComplete, true);
  await service.undo("n1", revision.id, revision.afterRawHash);
  assert.equal(rows("chapter")[0].content, "润色前");
});

test("unsupported write caught by business code cannot be sealed as safely reversible", async () => {
  reset(); const revision = await runPolish(async () => {
    try { await polishPrisma.world.create({ data: { name: "unknown mutation" } }); } catch { /* existing optional path */ }
  });
  assert.equal(JSON.parse(revision.afterChapterStateJson).captureComplete, false);
  assert.equal((await service.detail("n1", revision.id)).undoEligibility.allowed, false);
  assert.equal(rows("world").length, 0);
});

test("an index worker cannot resurrect a queued job cancelled after its initial status read", async () => {
  reset();
  for (const [file, name] of [["../dist/services/rag/indexing/index.js", "RagOwnerIndexingService"], ["../dist/services/rag/RagContextualChunkService.js", "RagContextualChunkService"]]) {
    const filename = require.resolve(file); require.cache[filename] = { id: filename, filename, loaded: true, exports: { [name]: class {} } };
  }
  const { RagIndexService } = require("../dist/services/rag/RagIndexService.js");
  const index = new RagIndexService({}, {}, {});
  rows("ragIndexJob").push({ id: "race", status: "queued", payloadJson: null, ownerType: "chapter", ownerId: "c1" });
  failWrite = (model, method, data) => { if (model === "ragIndexJob" && method === "updateMany" && data.status === "running") rows(model)[0].status = "cancelled"; };
  const result = await index.updateJobStatus("race", { status: "running" });
  assert.equal(result.status, "cancelled"); assert.equal(rows("ragIndexJob")[0].payloadJson, null);
});

test("an opted-in write cannot silently escape to another book", async () => {
  reset(); rows("chapter").push({ id: "foreign", novelId: "n2", content: "另一书", chapterStatus: "completed" });
  const revision = await runPolish(async () => {
    try { await polishPrisma.chapter.update({ where: { id: "foreign" }, data: { content: "错误覆盖" } }); } catch { /* optional caller */ }
  });
  assert.equal(rows("chapter").find((chapter) => chapter.id === "foreign").content, "另一书");
  assert.equal(JSON.parse(revision.afterChapterStateJson).captureComplete, false);
});
