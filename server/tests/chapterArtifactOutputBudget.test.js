const test = require("node:test");
const assert = require("node:assert/strict");
const factory = require("../dist/llm/factory.js");
const router = require("../dist/llm/modelRouter.js");
const fallback = require("../dist/llm/structuredFallbackSettings.js");
const template = require("../dist/prompting/templates/templateRuntime.js");
const { promptSlotOverrideService } = require("../dist/prompting/slots/PromptSlotOverrideService.js");
const { chapterArtifactDeltaPrompt } = require("../dist/prompting/prompts/novel/chapterArtifactDelta.prompts.js");
const { characterResourceLedgerService } = require("../dist/services/novel/characterResource/CharacterResourceLedgerService.js");
const { stateService } = require("../dist/services/state/StateService.js");

function loadExtractionService(source) {
  const sourcePath = require.resolve("../dist/services/novel/artifacts/infrastructure/ChapterSourceTransaction.js");
  const servicePath = require.resolve("../dist/services/novel/artifacts/application/ChapterArtifactDeltaService.js");
  const savedSource = require.cache[sourcePath];
  const savedService = require.cache[servicePath];
  const loadedBefore = new Set(Object.keys(require.cache));
  require.cache[sourcePath] = { id: sourcePath, filename: sourcePath, loaded: true, exports: source };
  delete require.cache[servicePath];
  try {
    return require(servicePath).ChapterArtifactDeltaService;
  } finally {
    // A newly loaded artifact store can retain the temporary source adapter.
    for (const loaded of Object.keys(require.cache)) {
      if (!loadedBefore.has(loaded)) delete require.cache[loaded];
    }
    if (savedSource) require.cache[sourcePath] = savedSource;
    else delete require.cache[sourcePath];
    if (savedService) require.cache[servicePath] = savedService;
    else delete require.cache[servicePath];
  }
}

test("artifact extraction and JSON repair retain the registered output allowance", async (t) => {
  const done = new Error("extraction complete; persistence outside this fixture");
  const clients = [];
  const routeReads = [];
  const content = "程秩把后门铜钥匙收进袖中，并决定先观察换岗。";
  const ChapterArtifactDeltaService = loadExtractionService({
    artifactPrisma: {
      novel: { findUnique: async () => ({ title: "钥匙" }) },
      chapter: {
        findFirst: async () => ({ id: "c1", order: 1, title: "后门", expectation: "取得钥匙", taskSheet: null }),
        findMany: async () => [{ id: "c1", order: 1, title: "后门", content }],
      },
      character: { findMany: async () => [] },
      payoffLedgerItem: { findMany: async () => [] },
    },
    runWithChapterSource: async () => { throw done; },
  });
  const service = new ChapterArtifactDeltaService();
  t.mock.method(characterResourceLedgerService, "listResources", async () => []);
  t.mock.method(service.characters, "listActiveCharacterDialogueInfluences", async () => []);
  t.mock.method(stateService, "getLatestSnapshotBeforeChapter", async () => null);
  t.mock.method(template, "resolveAdvancedPromptMessages", async ({ officialMessages }) => officialMessages);
  t.mock.method(promptSlotOverrideService, "resolveForRuntime", async () => ({ appendBlocks: [] }));
  t.mock.method(router, "resolveModel", async (taskType, overrides) => {
    routeReads.push({ taskType, overrides });
    return { provider: "openai", model: "gpt-4o-mini", temperature: 0.2, maxTokens: 12000,
      requestProtocol: "openai_compatible", structuredResponseFormat: "prompt_json" };
  });
  factory.setProviderSecretCache("openai", { key: "fixture-key", model: "gpt-4o-mini",
    baseURL: "https://fixture.invalid/v1", reasoningEnabled: false });
  t.after(() => factory.setProviderSecretCache("openai", null));
  t.mock.method(fallback, "getStructuredFallbackSettings", async () => ({
    enabled: false, provider: "openai", model: "gpt-4o-mini", temperature: 0.2, maxTokens: null,
  }));
  t.mock.method(factory, "createLLMFromResolvedOptions", (resolved) => {
    clients.push(resolved);
    return { async *stream() {
      yield { content: resolved.temperature === 0.15
        ? JSON.stringify(chapterArtifactDeltaPrompt.structuredOutputHint.example)
        : "invalid JSON" };
    } };
  });
  t.mock.method(factory, "getLLM", async (provider, options) =>
    factory.createLLMFromResolvedOptions(await factory.resolveLLMClientOptions(provider, options)));

  await assert.rejects(service.syncChapterArtifacts({ novelId: "n1", chapterId: "c1", content,
    provider: "openai", model: "gpt-4o-mini" }), (error) => error === done);

  assert.ok(routeReads.length > 0);
  assert.ok(routeReads.every(({ taskType }) => taskType === "fact_extraction"));
  assert.equal(clients.length, 2, "generation is followed by one JSON repair");
  assert.equal(chapterArtifactDeltaPrompt.maxOutputTokens, 8000);
  assert.deepEqual(clients.map(({ maxTokens }) => maxTokens), [8000, 8000]);
  assert.equal(clients[1].temperature, 0.15);
});
