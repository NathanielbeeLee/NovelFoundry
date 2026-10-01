const test = require("node:test");
const assert = require("node:assert/strict");
const { z } = require("zod");
const factory = require("../dist/llm/factory.js");
const fallback = require("../dist/llm/structuredFallbackSettings.js");
const { resolveStructuredOutputProfile } = require("../dist/llm/structuredOutput.js");
const { prepareStructuredLlmInvocation, invokeStructuredLlmDetailed } = require("../dist/llm/structuredInvoke.js");

function installConfig(t, state, options = {}) {
  const resolutions = [];
  const clients = [];
  t.mock.method(factory, "resolveLLMClientOptions", async (provider, request) => {
    resolutions.push({ provider, request });
    if (provider === "broken") throw new Error("Fixture missing fallback configuration");
    const model = request.model ?? state.model;
    return {
      provider: provider ?? "openai", providerName: "Fixture", model,
      apiKey: request.apiKey ?? state.key, baseURL: request.baseURL ?? state.endpoint,
      authMode: request.authMode ?? "bearer", temperature: request.temperature ?? 0.2,
      maxTokens: request.maxTokens, timeoutMs: request.timeoutMs, maxRetries: 0,
      reasoningEnabled: state.reasoning, reasoningEffort: "high", reasoningForcedOff: false,
      includeRawResponse: false, modelKwargs: { fixture: state.reasoning },
      concurrencyLimit: 1, requestIntervalMs: 0, requestProtocol: state.protocol,
      executionMode: request.executionMode, structuredStrategy: request.structuredStrategy ?? null,
      structuredProfile: resolveStructuredOutputProfile({ provider: provider ?? "openai", model,
        baseURL: request.baseURL ?? state.endpoint, executionMode: "structured", requestProtocol: state.protocol }),
    };
  });
  t.mock.method(fallback, "getStructuredFallbackSettings", async () => options.fallback ?? ({
    enabled: false, provider: "deepseek", model: "deepseek-chat", temperature: 0.2, maxTokens: null,
  }));
  t.mock.method(factory, "getLLM", async () => { throw new Error("Prepared execution must not resolve a repair client"); });
  t.mock.method(factory, "createLLMFromResolvedOptions", (resolved) => {
    clients.push(resolved);
    return { async *stream() {
      if (options.stream) yield* options.stream(resolved);
      else yield { content: '{"value":"ok"}' };
    } };
  });
  return { resolutions, clients };
}

const request = () => ({
  provider: "openai", taskType: "review", schema: z.object({ value: z.string() }),
  label: "fixture.prepared", systemPrompt: "Return JSON", userPrompt: "Assess", maxTokens: 1600,
});
const state = () => ({ model: "gpt-4o-mini", key: "fixture-key-a", endpoint: "https://fixture.invalid/a", reasoning: false, protocol: "chat_completions" });

test("preparation is invocation-free and execution plus JSON repair use the frozen configuration", async (t) => {
  const config = state();
  const trace = installConfig(t, config, { stream: async function* (resolved) {
    yield { content: resolved.temperature === 0.15 ? '{"value":"repaired"}' : "broken JSON" };
  } });
  const input = request();
  const plan = await prepareStructuredLlmInvocation(input);
  const reads = trace.resolutions.length;
  assert.equal(trace.clients.length, 0);
  assert.equal(plan.cacheable, true);
  Object.assign(config, { key: "fixture-key-b", model: "gpt-4.1", endpoint: "https://fixture.invalid/b", protocol: "responses", reasoning: true });
  const result = await invokeStructuredLlmDetailed({ ...input, preparedInvocation: plan });
  assert.deepEqual(result.data, { value: "repaired" });
  assert.equal(result.repairUsed, true);
  assert.equal(trace.resolutions.length, reads);
  assert.equal(trace.clients.length, 2);
  for (const client of trace.clients) {
    assert.equal(client.model, "gpt-4o-mini");
    assert.equal(client.apiKey, "fixture-key-a");
    assert.equal(client.baseURL, "https://fixture.invalid/a");
    assert.equal(client.requestProtocol, "chat_completions");
    assert.equal(client.reasoningEnabled, false);
  }
});

test("changed resolved model, protocol, endpoint, credential, reasoning and fallback settings change the identity", async (t) => {
  const config = state();
  const fallbackSettings = { enabled: true, provider: "deepseek", model: "deepseek-chat", temperature: 0.2, maxTokens: 800 };
  installConfig(t, config, { fallback: fallbackSettings });
  const initial = await prepareStructuredLlmInvocation(request());
  for (const [field, value] of Object.entries({ model: "gpt-4.1", protocol: "responses", endpoint: "https://fixture.invalid/b", key: "fixture-key-b", reasoning: true })) {
    const oldValue = config[field];
    config[field] = value;
    assert.notEqual((await prepareStructuredLlmInvocation(request())).identityDigest, initial.identityDigest, field);
    config[field] = oldValue;
  }
  fallbackSettings.temperature = 0.3;
  assert.notEqual((await prepareStructuredLlmInvocation(request())).identityDigest, initial.identityDigest);
  assert.match(initial.identityDigest, /^[a-f0-9]{64}$/);
});

test("fallback clients are prepared with the primary and used without configuration reloading", async (t) => {
  const config = state();
  const settings = { enabled: true, provider: "deepseek", model: "deepseek-chat", temperature: 0.2, maxTokens: 800 };
  const trace = installConfig(t, config, { fallback: settings, stream: async function* (resolved) {
    if (resolved.provider === "openai") throw new Error("fetch failed");
    yield { content: '{"value":"fallback"}' };
  } });
  const input = request();
  const plan = await prepareStructuredLlmInvocation(input);
  const reads = trace.resolutions.length;
  settings.enabled = false;
  config.key = "fixture-key-b";
  const result = await invokeStructuredLlmDetailed({ ...input, preparedInvocation: plan });
  assert.equal(result.diagnostics.fallbackUsed, true);
  assert.equal(result.data.value, "fallback");
  assert.equal(trace.resolutions.length, reads);
  assert.equal(trace.clients.at(-1).apiKey, "fixture-key-a");
});

test("invalid optional fallback configuration does not block a healthy primary and disables reuse", async (t) => {
  const config = state();
  installConfig(t, config, { fallback: { enabled: true, provider: "broken", model: "missing", temperature: 0.2, maxTokens: null } });
  const input = request();
  const plan = await prepareStructuredLlmInvocation(input);
  assert.equal(plan.cacheable, false);
  assert.ok(plan.fallbackPreparationError);
  assert.equal((await invokeStructuredLlmDetailed({ ...input, preparedInvocation: plan })).data.value, "ok");
});

test("prepared cancellation never starts the fallback", async (t) => {
  const failure = Object.assign(new Error("Cancelled"), { name: "AbortError" });
  const trace = installConfig(t, state(), {
    fallback: { enabled: true, provider: "deepseek", model: "deepseek-chat", temperature: 0.2, maxTokens: null },
    stream: async function* () { throw failure; },
  });
  const input = request();
  const plan = await prepareStructuredLlmInvocation(input);
  await assert.rejects(invokeStructuredLlmDetailed({ ...input, preparedInvocation: plan }), (error) => error.cause === failure);
  assert.deepEqual(trace.clients.map((client) => client.provider), ["openai"]);
});
