const test = require("node:test");
const assert = require("node:assert/strict");
const { z } = require("zod");
const factory = require("../dist/llm/factory.js");
const fallback = require("../dist/llm/structuredFallbackSettings.js");
const { resolveStructuredOutputProfile } = require("../dist/llm/structuredOutput.js");
const { StreamOutcomeError, isLlmInvocationCancelled } = require("../dist/llm/streamOutcome/index.js");
const { invokeStructuredLlmDetailed, parseStructuredLlmRawContentDetailed } = require("../dist/llm/structuredInvoke.js");

function resolvedOptions(provider, options = {}) {
  const model = options.model ?? "gpt-4o-mini";
  const profile = resolveStructuredOutputProfile({ provider, model, executionMode: "structured" });
  return {
    provider, providerName: provider, model, apiKey: "fixture-key", baseURL: "https://provider.invalid/v1",
    temperature: 0.2, reasoningEnabled: false, reasoningForcedOff: true,
    includeRawResponse: false, executionMode: "structured", structuredProfile: profile,
    structuredStrategy: options.structuredStrategy ?? null,
  };
}

test("structured cancellation retains its cause and never invokes a fallback provider", async (t) => {
  for (const failure of [
    Object.assign(new Error("Operation cancelled"), { name: "AbortError" }),
    new StreamOutcomeError("cancelled"),
  ]) {
    await t.test(failure.name, async (t) => {
      const invoked = [];
      t.mock.method(factory, "resolveLLMClientOptions", async (provider, options) => resolvedOptions(provider, options));
      t.mock.method(factory, "createLLMFromResolvedOptions", (resolved) => ({
        async *stream() { invoked.push(resolved.provider); throw failure; },
      }));
      t.mock.method(fallback, "getStructuredFallbackSettings", async () => ({
        enabled: true, provider: "deepseek", model: "deepseek-chat", temperature: 0.2, maxTokens: null,
      }));
      await assert.rejects(invokeStructuredLlmDetailed({
        provider: "openai", model: "gpt-4o-mini", label: "fixture.cancel",
        taskType: "planner", schema: z.object({ value: z.string() }),
        systemPrompt: "Return JSON", userPrompt: "A value", disableFallbackModel: false,
      }), (error) => {
        assert.equal(error.cause, failure);
        assert.equal(isLlmInvocationCancelled(error), true);
        return true;
      });
      assert.deepEqual(invoked, ["openai"]);
    });
  }
});

test("cancelling JSON or schema repair stops immediately rather than consuming repair attempts", async (t) => {
  for (const rawContent of ["invalid JSON", '{"value":123}']) {
    await t.test(rawContent, async (t) => {
      const failure = new StreamOutcomeError("cancelled");
      let calls = 0;
      t.mock.method(factory, "getLLM", async () => ({
        async *stream() { calls += 1; throw failure; },
      }));
      await assert.rejects(parseStructuredLlmRawContentDetailed({
        rawContent, schema: z.object({ value: z.string() }), provider: "deepseek", model: "deepseek-chat",
        label: "fixture.cancel.repair", maxRepairAttempts: 3, strategy: "prompt_json",
        profile: resolveStructuredOutputProfile({ provider: "deepseek", model: "deepseek-chat", executionMode: "structured" }),
      }), (error) => error === failure);
      assert.equal(calls, 1);
    });
  }
});
