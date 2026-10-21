const test = require("node:test");
const assert = require("node:assert/strict");
const { buildVolumeWorkspaceDocument } = require("../dist/services/novel/volume/volumeWorkspaceDocument.js");

function loadGenerationService(generate) {
  const stub = (relative, exports) => [require.resolve(`../dist/${relative}.js`), exports];
  const mocks = [
    stub("db/prisma", { prisma: {} }),
    stub("services/novel/artifacts/persistence", { artifactPrisma: {} }),
    stub("services/novel/storyMacro/StoryMacroPlanService", { StoryMacroPlanService: class {} }),
    stub("services/styleEngine/StyleBindingService", { StyleBindingService: class {} }),
    stub("services/novel/volume/ChapterExecutionContractService", { ChapterExecutionContractService: class {} }),
    stub("services/novel/volume/VolumeChapterSyncService", { VolumeChapterSyncService: class {} }),
    stub("services/novel/volume/legacyVolumeSource", {}),
    stub("services/novel/volume/volumeStorylineCompat", {}),
    stub("services/novel/volume/volumeWorkspacePersistence", {}),
    stub("services/novel/volume/workspace/infrastructure/VolumeWorkspacePersistenceService", { VolumeWorkspacePersistenceService: class {} }),
    stub("services/novel/volume/volumeGenerationOrchestrator", { generateVolumePlanDocument: generate }),
    stub("services/novel/volume/volumeGenerationTelemetry", {
      withHighMemoryVolumeGenerationGuard: async (_novel, _options, work) => work(),
      resolveVolumeGenerationTelemetryStage: () => "fixture", resolveVolumeGenerationTelemetryItemKey: () => "fixture",
    }),
  ];
  const serviceId = require.resolve("../dist/services/novel/volume/workspace/application/NovelVolumeService.js");
  const original = new Map([...mocks.map(([id]) => id), serviceId].map(id => [id, require.cache[id]]));
  try {
    for (const [id, exports] of mocks) require.cache[id] = { id, filename: id, loaded: true, exports };
    delete require.cache[serviceId];
    return require(serviceId).NovelVolumeService;
  } finally {
    for (const [id, prior] of original) { if (prior) require.cache[id] = prior; else delete require.cache[id]; }
  }
}

const empty = () => buildVolumeWorkspaceDocument({ novelId: "fixture-book", volumes: [] });

for (const [name, options, expectedWrites, expectedEnsures] of [
  ["JIT even when a caller asks to persist intermediate output", { entrypoint: "jit_route_window", persistIntermediateDocuments: true }, 0, 0],
  ["explicit no-persist generation", { persistIntermediateDocuments: false }, 0, 0],
  ["manual generation retains final document persistence", {}, 1, 1],
  ["manual explicit intermediate persistence stays enabled", { persistIntermediateDocuments: true }, 2, 1],
]) {
  test(name, async () => {
    const writes = [], callbacks = [];
    let ensures = 0, reads = 0;
    const Service = loadGenerationService(async ({ workspace, options }) => {
      for (const isFinal of [false, true]) await options.onIntermediateDocument({ scope: "chapter_list", isFinal, document: workspace });
      return workspace;
    });
    const service = {
      readRouteWindowWorkspace: async () => { reads++; return { document: empty(), revision: "saved" }; },
      ensureVolumeWorkspace: async () => { ensures++; return empty(); },
      persistWorkspaceDocument: async (_id, document) => { writes.push(document); return document; },
      storyMacroPlanService: {},
    };
    const result = await Service.prototype.generateVolumes.call(service, "fixture-book", {
      scope: "chapter_list", ...options, onIntermediateDocument: event => callbacks.push(event.isFinal),
    });
    assert.equal(result.novelId, "fixture-book");
    assert.equal(writes.length, expectedWrites);
    assert.equal(ensures, expectedEnsures);
    assert.equal(reads, expectedEnsures ? 0 : 1);
    assert.deepEqual(callbacks, [false, true]);
  });
}

test("JIT generator failure after final candidate events cannot persist that candidate", async () => {
  let writes = 0;
  const Service = loadGenerationService(async ({ workspace, options }) => {
    await options.onIntermediateDocument({ scope: "chapter_list", isFinal: true, document: workspace });
    throw new Error("final generator validation failed");
  });
  await assert.rejects(Service.prototype.generateVolumes.call({
    readRouteWindowWorkspace: async () => ({ document: empty(), revision: "saved" }),
    ensureVolumeWorkspace: async () => { throw new Error("initializer must not run"); },
    persistWorkspaceDocument: async () => { writes++; }, storyMacroPlanService: {},
  }, "fixture-book", { scope: "chapter_list", entrypoint: "jit_route_window" }), /final generator validation failed/);
  assert.equal(writes, 0);
});
