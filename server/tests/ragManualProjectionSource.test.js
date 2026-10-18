const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { lockRagProjectionSource } = require("../dist/services/rag/indexing/infrastructure/RagProjectionSourceLock.js");
function load(overrides, target) {
  const loadedBefore = new Set(Object.keys(require.cache));
  const saved = new Map(); const resolve = relative => require.resolve(path.join(__dirname, "../dist", relative));
  try {
    for (const [relative, exports] of Object.entries(overrides)) {
      const id = resolve(relative); saved.set(id, require.cache[id]);
      require.cache[id] = { id, filename: id, loaded: true, exports };
    }
    const id = resolve(target); saved.set(id, require.cache[id]); delete require.cache[id];
    return require(id);
  } finally {
    for (const id of Object.keys(require.cache)) if (!loadedBefore.has(id)) delete require.cache[id];
    for (const [id, previous] of saved) {
      if (previous) require.cache[id] = previous; else delete require.cache[id];
    }
  }
}
const candidate = type => ({ id: "new-point", tenantId: "default", ownerType: type, ownerId: "row",
  novelId: "n", chunkText: "evidence", chunkHash: "hash", chunkOrder: 0, tokenEstimate: 2,
  language: "zh", embedProvider: "fixture", embedModel: "fixture", embedVersion: 1,
  metadataJson: JSON.stringify({ updatedAt: new Date(1).toISOString() }) });

for (const ownerType of ["consistency_fact", "character_timeline"]) {
  test(`${ownerType} indexing refuses deleted or changed source rows and failed locks`, async () => {
    let row = { id: "row", novelId: "n", updatedAt: new Date(1) }; let locked = 1;
    const delegate = { findUnique: async () => row, updateMany: async () => ({ count: locked }) };
    const tx = { $executeRaw: async () => locked, consistencyFact: delegate, characterTimeline: delegate };
    await lockRagProjectionSource(tx, ownerType, "row", [candidate(ownerType)]);
    row = null;
    await assert.rejects(lockRagProjectionSource(tx, ownerType, "row", [candidate(ownerType)]), /projection changed/);
    row = { id: "row", novelId: "n", updatedAt: new Date(2) };
    await assert.rejects(lockRagProjectionSource(tx, ownerType, "row", [candidate(ownerType)]), /projection changed/);
    row.updatedAt = new Date(1); locked = 0;
    await assert.rejects(lockRagProjectionSource(tx, ownerType, "row", [candidate(ownerType)]), /before index commit/);
  });
}

test("late embedding cannot recreate index metadata after manual-save projection invalidation", async () => {
  const events = [];
  const tx = { $executeRaw: async () => 1, characterTimeline: { findUnique: async () => null },
    knowledgeChunk: { createMany: async () => events.push("metadata") } };
  const { RagIndexStore } = load({
    "services/novel/artifacts/persistence.js": { artifactPrisma: { $transaction: run => run(tx) } },
  }, "services/rag/indexing/infrastructure/RagIndexStore.js");
  const store = new RagIndexStore({
    upsertPoints: async () => events.push("staged-vector"),
    deletePoints: async ids => events.push(["cleanup", ids]),
  });
  await assert.rejects(store.replaceOwnerChunks({ ownerType: "character_timeline", ownerId: "row", tenantId: "default",
    candidates: [candidate("character_timeline")], vectors: [[1]] }), /projection changed/);
  assert.deepEqual(events, ["staged-vector", ["cleanup", ["new-point"]]]);
});

test("retrieval excludes missing/replaced fact and timeline owners even if vectors remain", async () => {
  const records = ["character_timeline", "consistency_fact"].map((ownerType, index) => ({
    id: `point-${index}`, ownerType, ownerId: "row", novelId: "n", title: "Evidence", chunkText: "text", chunkOrder: 0,
    metadataJson: JSON.stringify({ updatedAt: new Date(1).toISOString() }),
  }));
  let rows = [{ id: "row", novelId: "n", updatedAt: new Date(1) }];
  const { filterCurrentRagChunks } = load({ "db/prisma.js": { prisma: {
    knowledgeChunk: { findMany: async () => records },
    characterTimeline: { findMany: async () => rows }, consistencyFact: { findMany: async () => rows },
  } } }, "services/rag/retrieval/infrastructure/CurrentRagChunkReadStore.js");
  const chunks = records.map(record => ({ ...record, score: 1 }));
  assert.equal((await filterCurrentRagChunks(chunks, "default")).length, 2);
  rows = [{ id: "row", novelId: "n", updatedAt: new Date(2) }];
  assert.deepEqual(await filterCurrentRagChunks(chunks, "default"), []);
  rows = [];
  assert.deepEqual(await filterCurrentRagChunks(chunks, "default"), []);
});

test("a newer source gets a queued RAG successor while an older revision runs", async () => {
  const created = [];
  const running = { id: "old-job", status: "running", payloadJson: JSON.stringify({ sourceRevision: "c:old" }) };
  const db = { ragIndexJob: { findFirst: async () => running,
    create: async ({ data }) => { created.push(data); return data; },
  } };
  const { RagIndexService } = load({
    "db/prisma.js": { prisma: {} },
    "config/rag.js": { ragConfig: { defaultTenantId: "default", workerMaxAttempts: 3 } },
    "services/rag/indexing/index.js": { RagOwnerIndexingService: class {} },
    "services/settings/RagSettingsService.js": { getRagEmbeddingSettings: async () => ({}) },
    "services/rag/EmbeddingService.js": { EmbeddingService: class {} },
    "services/rag/VectorStoreService.js": { VectorStoreService: class {} },
    "services/rag/RagContextualChunkService.js": { RagContextualChunkService: class {} },
  }, "services/rag/RagIndexService.js");
  const service = Object.create(RagIndexService.prototype);
  const next = await service.enqueueOwnerJob("upsert", "chapter", "c", { db, payload: { sourceRevision: "c:new" } });
  assert.equal(next.status, "queued"); assert.equal(created.length, 1);
  assert.equal(JSON.parse(next.payloadJson).sourceRevision, "c:new");
  const same = await service.enqueueOwnerJob("upsert", "chapter", "c", { db, payload: { sourceRevision: "c:old" } });
  assert.equal(same, running); assert.equal(created.length, 1);
});
