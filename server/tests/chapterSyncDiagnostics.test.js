const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { buildContentHash } = require("../dist/services/novel/artifacts/domain/ChapterSourceIdentity.js");

function loadWithDatabase(db) {
  const before = new Set(Object.keys(require.cache));
  const saved = new Map();
  const getId = relative => require.resolve(path.join(__dirname, "../dist", relative));
  try {
    for (const [relative, exports] of Object.entries({
      "db/prisma.js": { prisma: db },
      "config/rag.js": { ragConfig: { defaultTenantId: "test-tenant" } },
      "services/novel/artifacts/persistence.js": { buildContentHash },
    })) {
      const id = getId(relative);
      saved.set(id, require.cache[id]);
      require.cache[id] = { id, filename: id, loaded: true, exports };
    }
    const root = "modules/novel/production/syncDiagnostics/";
    return {
      ...require(getId(`${root}domain/projectDiagnostics.js`)),
      ...require(getId(`${root}domain/sourceIdentity.js`)),
      ...require(getId(`${root}application/ChapterSyncDiagnosticsService.js`)),
      ...require(getId(`${root}infrastructure/ChapterSyncDiagnosticsRepository.js`)),
      ...require(getId("services/rag/indexing/sourceIdentity.js")),
      ...require(getId("services/novel/runtime/timelineFinalization/sourceIdentity.js")),
      ...require(getId("modules/novel/production/http/novelChapterEditorRoutes.js")),
    };
  } finally {
    for (const id of Object.keys(require.cache)) if (!before.has(id)) delete require.cache[id];
    for (const [id, value] of saved) {
      if (value) require.cache[id] = value;
      else delete require.cache[id];
    }
  }
}

const api = loadWithDatabase({});
const now = new Date("2026-10-29T03:00:00Z");
function fixture() {
  const chapter = { id: "c1", novelId: "n1", content: "章节正文", updatedAt: new Date(now - 60_000) };
  const summary = { summary: "FICTION_SUMMARY_SENTINEL_海底密室的钥匙", keyEvents: null, characterStates: null, hook: null,
    sourceContentHash: buildContentHash(chapter.content), updatedAt: new Date(now - 40_000) };
  return { chapter, summary, checkpoints: [], jobs: [], chunks: [], truncatedChunkOwners: [] };
}
function checkpoint(s, overrides = {}) {
  return { contentHash: buildContentHash(s.chapter.content), artifactType: "artifact_delta", syncMode: "adaptive",
    status: "succeeded", metadataJson: JSON.stringify({ sourceFreshnessVersion: 1 }), updatedAt: new Date(now - 20_000), ...overrides };
}
function timeline(s, overrides = {}) {
  return checkpoint(s, { artifactType: "timeline_finalization", syncMode: "stable",
    contentHash: api.hashContent(s.chapter.content.trim()),
    metadataJson: JSON.stringify({ sourceContentHash: buildContentHash(s.chapter.content) }), ...overrides });
}
function job(s, ownerType, status, overrides = {}) {
  return { ownerType, status, payloadJson: JSON.stringify({ sourceRevision: api.sourceRevision(s.chapter, s.summary) }),
    updatedAt: new Date(now - 10_000), ...overrides };
}
function chunk(s, ownerType, overrides = {}) {
  return { ownerType, indexedAt: new Date(now - 5_000), metadataJson: JSON.stringify({
    sourceContentHash: buildContentHash(s.chapter.content), updatedAt: s.chapter.updatedAt.toISOString(),
    sourceSummaryHash: api.buildSummarySourceHash(s.summary), ...overrides,
  }) };
}
function result(s, key, unchanged = true) {
  return api.projectChapterSyncDiagnostics(s, now, unchanged).items.find(item => item.key === key);
}

test("saved manual chapter needs no generation job and current records are sufficient", () => {
  const s = fixture();
  s.checkpoints = [checkpoint(s), timeline(s)];
  s.chunks = [chunk(s, "chapter"), chunk(s, "chapter_summary")];
  const response = api.projectChapterSyncDiagnostics(s, now, true);
  assert.equal(response.items.length, 5);
  assert.ok(response.items.every(item => item.status === "current"));
  assert.equal(response.source.chapterUpdatedAt, s.chapter.updatedAt.toISOString());
  assert.equal(response.consistency, "consistent");
  assert.ok(!JSON.stringify(response).includes(s.chapter.content));
  assert.ok(!JSON.stringify(response).includes(s.summary.summary));
});

test("old body records never establish current summary, artifact, timeline or index", () => {
  const s = fixture();
  s.checkpoints = [checkpoint(s), timeline(s)];
  s.chunks = [chunk(s, "chapter"), chunk(s, "chapter_summary")];
  s.chapter.content = "不同正文";
  assert.ok(api.projectChapterSyncDiagnostics(s, now, true).items.every(item => item.status === "stale"));
});

test("artifact success requires current summary, freshness version, and summary time fence", () => {
  for (const change of [
    s => { s.summary.sourceContentHash = null; },
    s => { s.summary.updatedAt = now; },
    s => { s.checkpoints[0].metadataJson = "{}"; },
    s => { s.checkpoints[0].metadataJson = "broken-json"; },
    s => { s.summary = null; },
  ]) {
    const s = fixture(); s.checkpoints = [checkpoint(s)]; change(s);
    assert.notEqual(result(s, "artifacts").status, "current");
  }
});

test("artifact success in another valid mode and skip-state-snapshot remains valid", () => {
  const s = fixture();
  s.checkpoints = [checkpoint(s, { status: "failed", syncMode: "strict" }), checkpoint(s)];
  assert.equal(result(s, "artifacts").status, "current");
});

test("running checkpoint expiry is observational and raw errors are never returned", () => {
  const s = fixture();
  s.checkpoints = [checkpoint(s, { status: "running" })];
  assert.equal(result(s, "artifacts").status, "running");
  s.checkpoints[0].updatedAt = new Date(now - 15 * 60_000);
  assert.equal(result(s, "artifacts").status, "stale");
  s.checkpoints[0].status = "failed";
  s.checkpoints[0].metadataJson = JSON.stringify({ reason: "SECRET raw model content" });
  assert.equal(result(s, "artifacts").status, "failed");
  assert.ok(!JSON.stringify(result(s, "artifacts")).includes("SECRET"));
});

test("timeline distinguishes degraded from stable and rejects legacy success metadata", () => {
  const s = fixture();
  s.checkpoints = [timeline(s, { syncMode: "degraded" })];
  assert.equal(result(s, "timeline").status, "degraded");
  s.checkpoints.push(timeline(s));
  assert.equal(result(s, "timeline").status, "current");
  s.checkpoints = [timeline(s, { metadataJson: "{}" })];
  assert.equal(result(s, "timeline").status, "unknown");
  s.chapter.content = "  章节正文  ";
  s.checkpoints = [timeline(s)];
  assert.equal(result(s, "timeline").status, "current");
});

test("index succeeds from local metadata, not from a succeeded or legacy job", () => {
  const s = fixture();
  s.jobs = [job(s, "chapter", "succeeded")];
  assert.equal(result(s, "ragChapter").status, "unknown");
  s.chunks = [chunk(s, "chapter")];
  s.jobs = [];
  assert.equal(result(s, "ragChapter").status, "current");
  s.chunks[0].metadataJson = "{}";
  assert.equal(result(s, "ragChapter").status, "stale");
});

test("chapter index requires saved revision even with identical canonical prose", () => {
  const s = fixture(); s.chunks = [chunk(s, "chapter")];
  s.chapter.updatedAt = now;
  assert.equal(result(s, "ragChapter").status, "stale");
});

test("local index with no completion timestamp remains unknown", () => {
  const s = fixture(); s.chunks = [{ ...chunk(s, "chapter"), indexedAt: null }];
  assert.equal(result(s, "ragChapter").status, "unknown");
});

test("summary regeneration invalidates old summary index without changing prose", () => {
  const s = fixture(); s.chunks = [chunk(s, "chapter_summary")];
  s.summary.summary = "更详细的摘要";
  assert.equal(result(s, "ragSummary").status, "stale");
});

test("index current queued/running/failed are distinct and old versions cannot claim them", () => {
  for (const status of ["queued", "running", "failed"]) {
    const s = fixture(); s.jobs = [job(s, "chapter", status)];
    assert.equal(result(s, "ragChapter").status, status);
    s.chapter.updatedAt = now;
    assert.equal(result(s, "ragChapter").status, "stale");
  }
});

test("bounded index evidence and mixed source chunks cannot produce a green result", () => {
  const s = fixture(); s.chunks = [chunk(s, "chapter")];
  s.truncatedChunkOwners = ["chapter"];
  assert.equal(result(s, "ragChapter").status, "unknown");
  s.truncatedChunkOwners = [];
  s.chunks.push(chunk(s, "chapter", { sourceContentHash: "old" }));
  assert.equal(result(s, "ragChapter").status, "stale");
});

test("empty prose is not applicable and absent evidence is unknown for manual text", () => {
  const s = fixture(); s.chapter.content = " \n ";
  assert.ok(api.projectChapterSyncDiagnostics(s, now, true).items.every(item => item.status === "not_applicable"));
  s.chapter.content = "新保存的正文"; s.summary = null;
  assert.ok(api.projectChapterSyncDiagnostics(s, now, true).items.every(item => item.status === "unknown"));
});

test("source or summary changed during inspection suppresses every success", async () => {
  for (const mutate of [
    s => { s.chapter.content += "修改"; },
    s => { s.chapter.updatedAt = now; },
    s => { s.summary.summary += "修改"; },
    s => { s.summary.sourceContentHash = null; },
    s => { s.summary.updatedAt = now; },
  ]) {
    const s = fixture(); s.checkpoints = [checkpoint(s), timeline(s)];
    const later = structuredClone(s); mutate(later);
    const service = new api.ChapterSyncDiagnosticsService({ readSnapshot: async () => s, readSource: async () => later }, () => now);
    const response = await service.get("n1", "c1");
    assert.equal(response.consistency, "changed_during_read");
    assert.ok(response.items.every(item => item.status === "unknown"));
  }
});

test("missing chapter returns 404 before any follow-up read", async () => {
  const service = new api.ChapterSyncDiagnosticsService({
    readSnapshot: async () => null,
    readSource: async () => { throw new Error("must not read"); },
  });
  await assert.rejects(service.get("n1", "missing"), error => error.statusCode === 404);
});

test("chapter deleted during inspection cannot retain a current diagnostic", async () => {
  const s = fixture();
  const service = new api.ChapterSyncDiagnosticsService({ readSnapshot: async () => s, readSource: async () => null }, () => now);
  const response = await service.get("n1", "c1");
  assert.equal(response.consistency, "changed_during_read");
  assert.ok(response.items.every(item => item.status === "unknown"));
});

test("repository enforces novel ownership, tenant scope, bounded SELECT-only serializable reads", async () => {
  const s = fixture(); const calls = [];
  const selectOnly = (model, methods) => new Proxy(methods, { get(target, key) {
    if (key in target) return target[key];
    throw new Error(`Unexpected database operation: ${model}.${String(key)}`);
  } });
  const tx = {
    chapter: selectOnly("chapter", { findFirst: async args => {
      calls.push(["chapter", args]); return args.where.novelId === "n1" ? s.chapter : null;
    } }),
    chapterSummary: selectOnly("summary", { findFirst: async args => {
      assert.equal(args.where.novelId, "n1"); return s.summary;
    } }),
    chapterArtifactSyncCheckpoint: selectOnly("checkpoint", {
      findMany: async args => { assert.equal(args.where.novelId, "n1"); assert.equal(args.take, 20); return []; },
      findFirst: async () => null,
    }),
    ragIndexJob: selectOnly("job", {
      findMany: async args => { assert.equal(args.where.tenantId, "test-tenant"); assert.equal(args.take, 10); return []; },
      findFirst: async () => null,
    }),
    knowledgeChunk: selectOnly("chunk", { findMany: async args => {
      assert.equal(args.where.novelId, "n1"); assert.equal(args.where.tenantId, "test-tenant"); assert.equal(args.take, 501);
      return args.where.ownerType === "chapter" ? Array.from({ length: 501 }, () => chunk(s, "chapter")) : [];
    } }),
  };
  const db = { $transaction: async (run, options) => {
    assert.equal(options.isolationLevel, "Serializable"); return run(tx);
  } };
  const { ChapterSyncDiagnosticsRepository } = loadWithDatabase(db);
  const repository = new ChapterSyncDiagnosticsRepository();
  assert.equal(await repository.readSnapshot("wrong-novel", "c1"), null);
  const snapshot = await repository.readSnapshot("n1", "c1");
  assert.deepEqual(snapshot.truncatedChunkOwners, ["chapter"]);
  assert.equal(snapshot.chunks.length, 500);
  assert.equal((await repository.readSource("n1", "c1")).chapter.id, "c1");
  assert.ok(calls.every(([, args]) => args.where.id === "c1"));
});

test("actual route registrar exposes read-only GET envelope and propagates 404", async () => {
  const routeApi = loadWithDatabase({});
  const routes = new Map();
  const router = { get: (path, ...handlers) => routes.set(path, handlers), post: () => {} };
  let failure = null;
  const response = api.projectChapterSyncDiagnostics(fixture(), now, true);
  const calls = [];
  routeApi.ChapterSyncDiagnosticsService.prototype.get = async (novelId, chapterId) => {
    calls.push({ novelId, chapterId });
    if (failure) throw failure;
    return response;
  };
  const { z } = require("zod");
  routeApi.registerNovelChapterEditorRoutes({
    router, novelService: {}, chapterParamsSchema: z.object({ id: z.string(), chapterId: z.string() }),
    rewritePreviewSchema: z.any(), aiRevisionPreviewSchema: z.any(), forwardBusinessError: () => false,
  });
  const handlers = routes.get("/:id/chapters/:chapterId/sync-diagnostics");
  assert.ok(handlers);
  assert.equal(handlers.length, 2);
  const request = { params: { id: "n1", chapterId: "c1" } };
  let envelope;
  let forwarded;
  const res = { json: value => { envelope = value; } };
  await handlers.at(-1)(request, res, error => { forwarded = error; });
  assert.deepEqual(calls, [{ novelId: "n1", chapterId: "c1" }]);
  assert.deepEqual(envelope, { success: true, data: response });
  assert.equal(forwarded, undefined);
  failure = Object.assign(new Error("章节不存在"), { statusCode: 404 });
  envelope = undefined;
  await handlers.at(-1)(request, res, error => { forwarded = error; });
  assert.equal(forwarded, failure);
  assert.equal(forwarded.statusCode, 404);
  assert.equal(envelope, undefined);
});
