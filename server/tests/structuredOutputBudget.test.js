const test = require("node:test");
const assert = require("node:assert/strict");
const { z } = require("zod");
const factory = require("../dist/llm/factory.js");
const router = require("../dist/llm/modelRouter.js");
const fallback = require("../dist/llm/structuredFallbackSettings.js");
const { prepareStructuredLlmInvocation, invokeStructuredLlmDetailed } = require("../dist/llm/structuredInvoke.js");

function configure(t, maxTokens) {
  factory.setProviderSecretCache("custom_budget", {
    key: "fixture-key", model: "fixture-model", baseURL: "https://fixture.invalid/v1",
  });
  t.after(() => factory.setProviderSecretCache("custom_budget", null));
  t.mock.method(router, "resolveModel", async () => ({
    provider: "custom_budget", model: "fixture-model", temperature: 0.3, maxTokens,
    requestProtocol: "openai_compatible", structuredResponseFormat: "prompt_json",
    routeKey: "planner", routeDegraded: false,
  }));
  t.mock.method(fallback, "getStructuredFallbackSettings", async () => ({ enabled: false }));
}

test("structured factory preserves route allowances and explicit overrides on custom and Anthropic endpoints", async (t) => {
  configure(t, 24000);
  for (const requestProtocol of ["openai_compatible", "anthropic"]) {
    const route = await factory.resolveLLMClientOptions(undefined, {
      taskType: "planner", executionMode: "structured", structuredStrategy: "prompt_json", requestProtocol,
    });
    assert.equal(route.maxTokens, 24000);
    assert.equal(route.structuredProfile.safeStructuredMaxTokens, 8192);
    for (const maxTokens of [5000, 16000]) {
      const explicit = await factory.resolveLLMClientOptions(undefined, {
        taskType: "planner", executionMode: "structured", structuredStrategy: "prompt_json", requestProtocol, maxTokens,
      });
      assert.equal(explicit.maxTokens, maxTokens);
    }
  }
});

test("an unset structured allowance stays unset rather than authorizing a larger output", async (t) => {
  configure(t, undefined);
  const resolved = await factory.resolveLLMClientOptions(undefined, {
    taskType: "planner", executionMode: "structured", structuredStrategy: "prompt_json",
  });
  assert.equal(resolved.maxTokens, undefined);
});

for (const prepared of [false, true]) {
  test(`${prepared ? "prepared" : "lazy"} structured generation and repair retain the capped route allowance`, async (t) => {
    configure(t, 24000);
    const clients = [];
    t.mock.method(factory, "createLLMFromResolvedOptions", (resolved) => {
      clients.push(resolved);
      return { async *stream() {
        yield { content: resolved.temperature === 0.15 ? '{"value":"repaired"}' : "invalid JSON" };
      } };
    });
    t.mock.method(factory, "getLLM", async (provider, options) =>
      factory.createLLMFromResolvedOptions(await factory.resolveLLMClientOptions(provider, options)));
    const input = {
      taskType: "planner", systemPrompt: "Return JSON", userPrompt: "Return a value",
      schema: z.object({ value: z.string() }), label: "fixture.output-budget",
      maxTokensCap: 18000, disableFallbackModel: true,
    };
    const preparedInvocation = prepared ? await prepareStructuredLlmInvocation(input) : undefined;
    const result = await invokeStructuredLlmDetailed({ ...input, preparedInvocation });
    assert.deepEqual(result.data, { value: "repaired" });
    assert.equal(result.repairAttempts, 1);
    assert.deepEqual(clients.map(({ maxTokens }) => maxTokens), [18000, 18000]);
  });
}
