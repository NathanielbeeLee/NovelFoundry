const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/db/prisma.js");
const { artifactPrisma, runWithChapterSource, currentChapterSource, buildContentHash, StaleChapterSourceError } = require("../dist/services/novel/artifacts/persistence.js");
const { NovelFactService } = require("../dist/services/novel/fact/NovelFactService.js");

function fixture(t, content = "最新正文") {
  const saved = { transaction: prisma.$transaction, factFind: prisma.novelFactEntry.findMany, factCreate: prisma.novelFactEntry.createMany };
  t.after(() => { prisma.$transaction = saved.transaction; prisma.novelFactEntry.findMany = saved.factFind; prisma.novelFactEntry.createMany = saved.factCreate; });
  const data = [];
  const guards = [];
  let transactionCount = 0;
  let casCount = 1;
  const tx = {
    chapter: {
      findFirst: async () => ({ content, updatedAt: new Date("2026-09-11T00:00:00Z") }),
      updateMany: async (args) => { guards.push(args); return { count: casCount }; },
    },
    novelFactEntry: {
      findMany: async () => [],
      createMany: async (args) => { data.push(...args.data); return { count: args.data.length }; },
    },
  };
  prisma.novelFactEntry.findMany = async () => { throw new Error("unscoped query inside artifact transaction"); };
  prisma.novelFactEntry.createMany = async () => { throw new Error("unscoped write inside artifact transaction"); };
  prisma.$transaction = async (run) => {
    transactionCount++;
    const before = [...data];
    try { return await run(tx); } catch (e) { data.splice(0, data.length, ...before); throw e; }
  };
  return { tx, data, guards, source: { novelId: "n1", chapterId: "c1", contentHash: buildContentHash(content) }, count: () => transactionCount, loseClaim: () => { casCount = 0; } };
}

test("stale extraction is rejected within actual transaction before any derived write", async (t) => {
  const f = fixture(t);
  let wrote = false;
  await assert.rejects(runWithChapterSource({ ...f.source, contentHash: buildContentHash("旧正文") }, async () => { wrote = true; }), StaleChapterSourceError);
  assert.equal(wrote, false);
  assert.equal(f.guards.length, 0);
});

test("a source change between read and conditional lock rejects commit", async (t) => {
  const f = fixture(t); f.loseClaim();
  await assert.rejects(runWithChapterSource(f.source, async () => { throw new Error("must not write"); }), StaleChapterSourceError);
  assert.equal(f.guards[0].where.content, "最新正文");
  assert.deepEqual(f.guards[0].where.updatedAt, f.guards[0].data.updatedAt);
});

test("canonical dependency writes and nested transactions join the locked source transaction", async (t) => {
  const f = fixture(t);
  await runWithChapterSource(f.source, async () => {
    await new NovelFactService().writeFacts("n1", 1, [{ text: "得到钥匙", category: "completed" }]);
    await artifactPrisma.$transaction(async (tx) => {
      await tx.novelFactEntry.createMany({ data: [{ text: "nested" }] });
    });
    assert.equal(currentChapterSource().contentHash, f.source.contentHash);
  });
  assert.equal(f.count(), 1);
  assert.equal(f.data[0].sourceContentHash, f.source.contentHash);
  assert.equal(f.data.length, 2);
  assert.equal(currentChapterSource(), undefined);
});

test("late artifact persistence failure rolls back earlier fact writes", async (t) => {
  const f = fixture(t);
  await assert.rejects(runWithChapterSource(f.source, async () => {
    await new NovelFactService().writeFacts("n1", 1, [{ text: "不能部分保存", category: "completed" }]);
    throw new Error("later snapshot persistence failed");
  }), /later snapshot/);
  assert.equal(f.data.length, 0);
});

test("an edited prior chapter invalidates the extraction dependency read set", async (t) => {
  const f = fixture(t);
  await assert.rejects(runWithChapterSource({ ...f.source, dependencies: [{ chapterId: "c0", contentHash: buildContentHash("前文旧版本") }] }, async () => { throw new Error("must not write"); }), StaleChapterSourceError);
});

test("fact retrieval keeps manual facts and excludes obsolete or unversioned generated facts", async (t) => {
  const originals = { facts: prisma.novelFactEntry.findMany, chapters: prisma.chapter.findMany };
  t.after(() => { prisma.novelFactEntry.findMany = originals.facts; prisma.chapter.findMany = originals.chapters; });
  const row = { novelId: "n1", chapterOrder: 1, category: "completed", source: "auto", createdAt: new Date() };
  prisma.novelFactEntry.findMany = async ({ where }) => typeof where.category === "string" ? [] : [
    { ...row, id: "current", text: "新事实", sourceContentHash: buildContentHash("最新正文") },
    { ...row, id: "stale", text: "旧事实", sourceContentHash: buildContentHash("旧正文") },
    { ...row, id: "legacy", text: "旧格式", sourceContentHash: null },
    { ...row, id: "manual", text: "手动确认", source: "manual", sourceContentHash: null },
  ];
  prisma.chapter.findMany = async () => [{ order: 1, content: "最新正文" }];
  assert.deepEqual((await new NovelFactService().listForChapter({ novelId: "n1", beforeChapterOrder: 2 })).map((r) => r.id), ["current", "manual"]);
});

test("legacy successful artifact checkpoints are reclaimed for real source-aware extraction", async (t) => {
  const { ChapterArtifactBackgroundSyncService } = require("../dist/services/novel/runtime/ChapterArtifactBackgroundSyncService.js");
  const service = new ChapterArtifactBackgroundSyncService();
  const model = prisma.chapterArtifactSyncCheckpoint;
  const saved = { findUnique: model.findUnique, create: model.create, updateMany: model.updateMany };
  const sourceSaved = { chapter: prisma.chapter.findFirst, summary: prisma.chapterSummary.findUnique };
  t.after(() => { Object.assign(model, saved); prisma.chapter.findFirst = sourceSaved.chapter; prisma.chapterSummary.findUnique = sourceSaved.summary; });
  const previous = { status: "succeeded", updatedAt: new Date(), metadataJson: "{}" };
  model.findUnique = async () => previous;
  model.create = async () => { throw new Error("existing key"); };
  let reclaimed = false;
  model.updateMany = async (args) => { assert.deepEqual(args.where.updatedAt, previous.updatedAt); reclaimed = true; return { count: 1 }; };
  const key = { novelId: "n1", chapterId: "c1", contentHash: buildContentHash("正文"), artifactType: "artifact_delta", syncMode: "adaptive" };
  assert.equal(await service.hasCompletedCheckpoint(key), false);
  assert.equal(await service.claimCheckpoint(key), "claimed");
  assert.equal(reclaimed, true);
  previous.metadataJson = JSON.stringify({ sourceFreshnessVersion: 1 });
  prisma.chapter.findFirst = async () => ({ content: "正文" });
  prisma.chapterSummary.findUnique = async () => ({ sourceContentHash: key.contentHash, updatedAt: previous.updatedAt });
  assert.equal(await service.hasCompletedCheckpoint(key), true);
  assert.equal(await service.claimCheckpoint(key), "already_done");
  // A -> B -> A: an old successful A checkpoint must not suppress rebuilding B-derived assets.
  prisma.chapterSummary.findUnique = async () => ({ sourceContentHash: buildContentHash("B正文"), updatedAt: previous.updatedAt });
  assert.equal(await service.hasCompletedCheckpoint(key), false);
  assert.equal(await service.claimCheckpoint(key), "claimed");
});

test("public summary generation cannot commit an old content override after editing", async (t) => {
  const f = fixture(t, "编辑后的正文");
  const { NovelChapterSummaryService } = require("../dist/services/novel/NovelChapterSummaryService.js");
  const runner = require("../dist/prompting/core/promptRunner.js");
  const saved = { chapter: prisma.chapter.findFirst, prompt: runner.runStructuredPrompt };
  t.after(() => { prisma.chapter.findFirst = saved.chapter; runner.runStructuredPrompt = saved.prompt; });
  prisma.chapter.findFirst = async () => ({ id: "c1", novelId: "n1", order: 1, content: "旧正文", expectation: "", novel: { title: "故事" } });
  runner.runStructuredPrompt = async () => ({ output: { summary: "旧正文摘要", concreteFacts: [] } });
  await assert.rejects(new NovelChapterSummaryService().generateChapterSummary("n1", "c1", { contentOverride: "旧正文" }), StaleChapterSourceError);
  assert.equal(f.data.length, 0);
});

test("cancellation during a database await rolls back the whole derived transaction", async (t) => {
  const f = fixture(t);
  const abort = new AbortController();
  await assert.rejects(runWithChapterSource({ ...f.source, signal: abort.signal }, async () => {
    await new NovelFactService().writeFacts("n1", 1, [{ text: "取消前尚未提交", category: "completed" }]);
    abort.abort(new Error("cancelled during persistence"));
  }), /cancelled during persistence/);
  assert.equal(f.data.length, 0);
});

test("legacy summary/facts/timeline persistence rejects a stale source before writing", async (t) => {
  const f = fixture(t, "新正文");
  const { ChapterArtifactSyncService } = require("../dist/services/novel/runtime/ChapterArtifactSyncService.js");
  await assert.rejects(new ChapterArtifactSyncService().syncChapterArtifacts("n1", "c1", "旧正文", { scheduleBackgroundSync: false }), StaleChapterSourceError);
  assert.equal(f.data.length, 0);
});

test("legacy timeline failure rolls back earlier summary and fact persistence", async (t) => {
  const f = fixture(t, "林川拿到了钥匙并关上城门。");
  const { ChapterArtifactSyncService } = require("../dist/services/novel/runtime/ChapterArtifactSyncService.js");
  f.tx.chapterSummary = { upsert: async (args) => { assert.equal(args.create.sourceContentHash, f.source.contentHash); f.data.push({ text: args.create.summary }); } };
  f.tx.consistencyFact = { deleteMany: async () => ({}), createMany: async (args) => { f.data.push(...args.data); } };
  f.tx.character = { findMany: async () => [{ id: "char1", name: "林川" }] };
  f.tx.characterTimeline = { deleteMany: async () => { throw new Error("timeline write failed"); } };
  await assert.rejects(new ChapterArtifactSyncService().syncChapterArtifacts("n1", "c1", "林川拿到了钥匙并关上城门。", { scheduleBackgroundSync: false }), /timeline write failed/);
  assert.equal(f.count(), 1);
  assert.equal(f.data.length, 0);
});

test("awaited background extraction forwards cancellation and cannot mark success afterward", async (t) => {
  const { ChapterArtifactBackgroundSyncService } = require("../dist/services/novel/runtime/ChapterArtifactBackgroundSyncService.js");
  const service = new ChapterArtifactBackgroundSyncService();
  const saved = prisma.chapter.findFirst;
  t.after(() => { prisma.chapter.findFirst = saved; });
  prisma.chapter.findFirst = async () => ({ id: "c1", order: 1, title: "章节", content: "正文" });
  const controller = new AbortController();
  let success = false;
  service.hasCompletedCheckpoint = async () => false;
  service.claimCheckpoint = async () => "claimed";
  service.runTrackedActivity = async (_novel, _ctx, _kind, run) => run();
  service.markCheckpointFailed = async () => {};
  service.markCheckpoint = async () => { success = true; };
  service.getArtifactDeltaService = () => ({ syncChapterArtifacts: async (input) => {
    assert.equal(input.signal, controller.signal);
    controller.abort(new Error("cancelled during extraction"));
    return { output: { syncPlan: {}, confidence: 1 } };
  } });
  await assert.rejects(service.runChapterSyncNow("n1", "c1", "正文", { signal: controller.signal }), /cancelled during extraction/);
  assert.equal(success, false);
});

test("cancellation while writing a background success checkpoint rolls it back", async (t) => {
  const f = fixture(t, "正文");
  const { ChapterArtifactBackgroundSyncService } = require("../dist/services/novel/runtime/ChapterArtifactBackgroundSyncService.js");
  const controller = new AbortController();
  f.tx.chapterArtifactSyncCheckpoint = { upsert: async () => {
    f.data.push({ status: "succeeded" });
    controller.abort(new Error("cancelled checkpoint"));
  } };
  await assert.rejects(new ChapterArtifactBackgroundSyncService().markCheckpoint({ ...f.source, signal: controller.signal, artifactType: "artifact_delta", syncMode: "adaptive" }), /cancelled checkpoint/);
  assert.equal(f.data.length, 0);
});

test("payoff reconciliation keeps AI outside the lock and rolls back cancellation during persistence", async (t) => {
  const f = fixture(t, "正文");
  const { PayoffLedgerSyncService } = require("../dist/services/payoff/PayoffLedgerSyncService.js");
  const runner = require("../dist/prompting/core/promptRunner.js");
  const saved = { chapters: prisma.chapter.findMany, prompt: runner.runStructuredPrompt };
  t.after(() => { prisma.chapter.findMany = saved.chapters; runner.runStructuredPrompt = saved.prompt; });
  prisma.chapter.findMany = async () => [];
  const abort = new AbortController();
  runner.runStructuredPrompt = async (input) => {
    assert.equal(currentChapterSource(), undefined);
    assert.equal(input.options.signal, abort.signal);
    return { output: { items: [] } };
  };
  const service = new PayoffLedgerSyncService();
  service.loadLedgerRows = async () => [];
  service.buildSyncPromptInput = async () => ({ promptInput: { bookContractPayoffs: [] }, chapterOrder: 1, latestSnapshotId: null });
  service.syncLedgerOpenConflicts = async () => {
    assert.equal(currentChapterSource().contentHash, f.source.contentHash);
    f.data.push({ text: "对账写入" });
    abort.abort(new Error("cancelled payoff commit"));
  };
  await assert.rejects(service.syncLedger("n1", { sourceChapterId: "c1", expectedContentHash: f.source.contentHash, signal: abort.signal }), /cancelled payoff commit/);
  assert.equal(f.data.length, 0);
});
