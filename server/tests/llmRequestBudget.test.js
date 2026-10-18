const test = require("node:test");
const assert = require("node:assert/strict");
const { HumanMessage } = require("@langchain/core/messages");
const { z } = require("zod");
const budget = require("../dist/llm/requestBudget/index.js");
const factory = require("../dist/llm/factory.js");
const fallback = require("../dist/llm/structuredFallbackSettings.js");
const { createOpenAIProtocolClient } = require("../dist/llm/protocols/OpenAIProtocolClient.js");
const { resolveStructuredOutputProfile, classifyStructuredOutputFailure } = require("../dist/llm/structuredOutput.js");
const { invokeStructuredLlmDetailed, parseStructuredLlmRawContentDetailed } = require("../dist/llm/structuredInvoke.js");
const { resolveStructuredOutput } = require("../dist/prompting/core/execution/application/StructuredPromptExecution.js");
const dependencies = require("../dist/prompting/core/execution/infrastructure/PromptExecutionDependencies.js");

function client(protocol = "openai_compatible", options = {}) {
  return createOpenAIProtocolClient({
    apiKey: "fixture-key", model: "gpt-4o-mini", maxRetries: 0, ...options,
    configuration: {
      baseURL: "https://provider.invalid/v1",
      fetch: factory.buildOpenAICompatibleFetch("bearer"),
      ...options.configuration,
    },
  }, protocol);
}

function streamResponse(content) {
  return new Response(`data: ${JSON.stringify({
    id: "fixture", object: "chat.completion.chunk", model: "gpt-4o-mini",
    choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: "stop" }],
  })}\n\ndata: [DONE]\n\n`, { headers: { "content-type": "text/event-stream" } });
}

test("nested assessments cannot refresh the default cap; sibling repair/recheck scopes reuse their owner", async () => {
  const phase = budget.createLlmRequestBudget({ label: "audit-repair-recheck" });
  assert.equal(phase.maxRequests, 8);
  await budget.withLlmRequestBudget(phase, async () => {
    for (let index = 0; index < 4; index++) budget.consumeLlmRequestBudget();
    await budget.runWithLlmRequestBudget({ label: "nested", maxRequests: 100 }, async () => {
      for (let index = 0; index < 3; index++) budget.consumeLlmRequestBudget();
    });
  });
  await budget.withLlmRequestBudget(phase, async () => budget.consumeLlmRequestBudget());
  await assert.rejects(budget.withLlmRequestBudget(phase, async () => {
    await budget.withLlmRequestBudget(budget.createLlmRequestBudget({ label: "new" }), async () => {
      budget.consumeLlmRequestBudget();
    });
  }), budget.isLlmRequestBudgetExhausted);
  assert.equal(phase.requestsUsed, 8);
  // An explicit new invocation has a fresh budget; unrelated work has no cap.
  await budget.runWithLlmRequestBudget({ label: "explicit-retry", maxRequests: 1 }, async () => budget.consumeLlmRequestBudget());
  for (let index = 0; index < 20; index++) budget.consumeLlmRequestBudget();
});

test("concurrent chapters are isolated while concurrent child requests share synchronous reservations", async () => {
  const scopes = [budget.createLlmRequestBudget({ label: "a", maxRequests: 2 }), budget.createLlmRequestBudget({ label: "b", maxRequests: 2 })];
  await Promise.all(scopes.map((scope) => budget.withLlmRequestBudget(scope, async () => {
    const results = await Promise.allSettled(Array.from({ length: 3 }, async () => {
      await Promise.resolve();
      budget.consumeLlmRequestBudget();
    }));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 2);
    assert.equal(results.filter((result) => result.status === "rejected" && budget.isLlmRequestBudgetExhausted(result.reason)).length, 1);
  })));
  assert.deepEqual(scopes.map((scope) => scope.requestsUsed), [2, 2]);
  for (const maxRequests of [0, -1, 1.5, Infinity]) assert.throws(() => budget.createLlmRequestBudget({ label: "invalid", maxRequests }), RangeError);
});

test("both installed OpenAI SDK protocol callers stop retrying wrapped exhausted-budget errors", async (t) => {
  for (const protocol of ["openai_compatible", "openai_responses"]) {
    await t.test(protocol, async (t) => {
      let actualFetches = 0;
      t.mock.method(global, "fetch", async () => {
        actualFetches++;
        return new Response(JSON.stringify({ error: { message: "retry", type: "rate_limit_error" } }), {
          status: 429, headers: { "content-type": "application/json" },
        });
      });
      const model = client(protocol, { maxRetries: 6 });
      await assert.rejects(budget.runWithLlmRequestBudget({ label: protocol, maxRequests: 1 }, () => model.invoke([new HumanMessage("fixture")])), (error) => {
        assert.equal(budget.isLlmRequestBudgetExhausted(error), true);
        assert.equal(classifyStructuredOutputFailure({ error }), "usage_budget_exceeded");
        return true;
      });
      assert.equal(actualFetches, 1);
    });
  }
});

test("endpoint fallback shares the same transport counter and cached results consume zero", async (t) => {
  let actualFetches = 0;
  t.mock.method(global, "fetch", async () => {
    actualFetches++;
    return new Response(JSON.stringify({ error: { message: "endpoint missing" } }), { status: 404, headers: { "content-type": "application/json" } });
  });
  const scope = budget.createLlmRequestBudget({ label: "fallback", maxRequests: 1 });
  const cachedAssessment = { score: 90 };
  assert.equal(await budget.withLlmRequestBudget(scope, async () => cachedAssessment), cachedAssessment);
  assert.equal(scope.requestsUsed, 0);
  await assert.rejects(budget.withLlmRequestBudget(scope, () => client("openai_compatible", {
    maxRetries: 6, configuration: { baseURL: "https://provider.invalid" },
  }).invoke([new HumanMessage("fixture")])), budget.isLlmRequestBudgetExhausted);
  assert.equal(actualFetches, 1);
  assert.equal(scope.requestsUsed, 1);
});

test("primary output, JSON repair attempts, strategies and fallback cannot exceed eight actual requests", async (t) => {
  let actualFetches = 0;
  const providers = [];
  t.mock.method(global, "fetch", async () => { actualFetches++; return streamResponse("invalid JSON"); });
  const model = client();
  const profile = resolveStructuredOutputProfile({ provider: "openai", model: "gpt-4o-mini", executionMode: "structured" });
  t.mock.method(factory, "resolveLLMClientOptions", async (provider) => ({
    provider, providerName: provider, model: "gpt-4o-mini", apiKey: "fixture-key", temperature: 0.2,
    executionMode: "structured", structuredProfile: profile, structuredStrategy: "prompt_json",
    reasoningEnabled: false, reasoningForcedOff: true, includeRawResponse: false,
  }));
  t.mock.method(factory, "createLLMFromResolvedOptions", (resolved) => { providers.push(resolved.provider); return model; });
  t.mock.method(factory, "getLLM", async () => model);
  t.mock.method(fallback, "getStructuredFallbackSettings", async () => ({ enabled: true, provider: "deepseek", model: "deepseek-chat", temperature: 0.2 }));
  await assert.rejects(budget.runWithLlmRequestBudget({ label: "all-nested-repairs" }, () => invokeStructuredLlmDetailed({
    provider: "openai", model: "gpt-4o-mini", label: "fixture.budget", taskType: "planner",
    schema: z.object({ value: z.string() }), systemPrompt: "Return JSON", userPrompt: "A value",
    maxRepairAttempts: 20,
  })), (error) => {
    assert.equal(error.category, "usage_budget_exceeded");
    assert.equal(budget.isLlmRequestBudgetExhausted(error), true);
    return true;
  });
  assert.equal(actualFetches, 8);
  assert.deepEqual(providers, ["openai"]);
});

test("exhausted schema repair is terminal and retains its typed cause", async (t) => {
  let repairCalls = 0;
  t.mock.method(factory, "getLLM", async () => ({
    async *stream() { repairCalls++; budget.consumeLlmRequestBudget(); yield { content: '{"value":123}' }; },
  }));
  await assert.rejects(budget.runWithLlmRequestBudget({ label: "schema", maxRequests: 1 }, () => parseStructuredLlmRawContentDetailed({
    rawContent: '{"value":123}', schema: z.object({ value: z.string() }), provider: "openai", model: "gpt-4o-mini",
    label: "schema-budget", maxRepairAttempts: 20, strategy: "prompt_json",
    profile: resolveStructuredOutputProfile({ provider: "openai", model: "gpt-4o-mini", executionMode: "structured" }),
  })), budget.isLlmRequestBudgetExhausted);
  assert.equal(repairCalls, 2);
});

test("semantic retries share the transport cap and exhaustion cannot recover into a successful assessment", async (t) => {
  let actualFetches = 0;
  let recoveries = 0;
  const guardedFetch = factory.buildOpenAICompatibleFetch("bearer");
  t.mock.method(global, "fetch", async () => { actualFetches++; return new Response("ok"); });
  const result = { data: { value: "bad" }, repairUsed: false, repairAttempts: 0, diagnostics: {} };
  dependencies.setPromptRunnerStructuredInvokerForTests(async () => { await guardedFetch("https://provider.invalid"); return result; });
  try {
    await assert.rejects(budget.runWithLlmRequestBudget({ label: "semantic", maxRequests: 3 }, async () => {
      await guardedFetch("https://provider.invalid");
      return resolveStructuredOutput({
        asset: {
          id: "fixture.budget", version: "1", taskType: "planner", mode: "structured", contextPolicy: {},
          semanticRetryPolicy: { maxAttempts: 20 },
          postValidate: () => { throw new Error("semantic value invalid"); },
          postValidateFailureRecovery: () => { recoveries++; return { value: "recovered" }; },
        },
        promptInput: {},
        context: { blocks: [], selectedBlockIds: [], droppedBlockIds: [], summarizedBlockIds: [], estimatedInputTokens: 0 },
        baseMessages: [new HumanMessage("fixture")],
        outputSchema: z.object({ value: z.string() }), initialResult: result,
      });
    }), budget.isLlmRequestBudgetExhausted);
    assert.equal(actualFetches, 3);
    assert.equal(recoveries, 0);
  } finally { dependencies.setPromptRunnerStructuredInvokerForTests(); }
});

test("error recognition tolerates wrapped causes and cycles without treating cancellation as exhaustion", () => {
  const error = new budget.LlmRequestBudgetExhaustedError(budget.createLlmRequestBudget({ label: "fixture" }));
  assert.equal(budget.isLlmRequestBudgetExhausted(new Error("transport", { cause: new Error("wrapped", { cause: error }) })), true);
  const cycle = new Error("cycle"); cycle.cause = cycle;
  assert.equal(budget.isLlmRequestBudgetExhausted(cycle), false);
  assert.equal(budget.isLlmRequestBudgetExhausted(Object.assign(new Error("cancel"), { name: "AbortError" })), false);
});
