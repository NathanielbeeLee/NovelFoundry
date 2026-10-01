const test = require("node:test");
const assert = require("node:assert/strict");
const { z } = require("zod");
const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const factory = require("../dist/llm/factory.js");
const fallback = require("../dist/llm/structuredFallbackSettings.js");
const template = require("../dist/prompting/templates/templateRuntime.js");
const { promptSlotOverrideService } = require("../dist/prompting/slots/PromptSlotOverrideService.js");
const runner = require("../dist/prompting/core/promptRunner.js");
const { chapterAcceptanceAssessmentPrompt } = require("../dist/prompting/prompts/novel/chapterAcceptance.prompts.js");
const { resolveStructuredOutputProfile } = require("../dist/llm/structuredOutput.js");

function fixture(t) {
  const config = { model: "gpt-4o-mini", addendum: "old slot", template: "old template", protocol: "chat_completions" };
  let modelReads = 0;
  t.mock.method(factory, "resolveLLMClientOptions", async (provider, options) => {
    modelReads += 1;
    return {
      provider: "openai", providerName: "Fixture", model: options.model ?? config.model,
      apiKey: "fixture-key", baseURL: "https://fixture.invalid", authMode: "bearer",
      temperature: options.temperature ?? 0.2, maxTokens: options.maxTokens, timeoutMs: options.timeoutMs,
      concurrencyLimit: 1, requestIntervalMs: 0, reasoningEnabled: false, reasoningEffort: null,
      reasoningForcedOff: false, includeRawResponse: false, requestProtocol: config.protocol,
      executionMode: options.executionMode, structuredStrategy: options.structuredStrategy ?? null,
      structuredProfile: resolveStructuredOutputProfile({ provider: "openai", model: options.model ?? config.model, executionMode: "structured", requestProtocol: config.protocol }),
    };
  });
  t.mock.method(fallback, "getStructuredFallbackSettings", async () => ({ enabled: false, provider: "openai", model: "gpt-4o-mini", temperature: 0.2, maxTokens: null }));
  t.mock.method(promptSlotOverrideService, "resolveForRuntime", async () => ({
    appendBlocks: [{ id: "custom_slot:fixture", group: "custom_slot", required: true, priority: 999, estimatedTokens: 10, content: config.addendum }],
    inlineSlots: {
      text: () => config.addendum, choiceCopy: () => "", enabled: () => false, token: () => "", append: () => config.addendum,
    },
  }));
  t.mock.method(template, "resolveAdvancedPromptMessages", async ({ officialMessages }) => [...officialMessages, new SystemMessage(config.template)]);
  const input = {
    asset: { ...chapterAcceptanceAssessmentPrompt,
      slots: [{ key: "fixture", kind: "append", label: "Fixture", default: "", maxLength: 100 }],
      outputSchema: z.object({ value: z.string() }),
      render: (value, context) => [new HumanMessage(`${value.novelTitle}|${value.chapterTitle}|${value.targetWordCount}|${value.content}|${context.blocks.map((block) => block.content).join("|")}`)],
    },
    promptInput: { novelTitle: "Book", chapterTitle: "Arrival", chapterOrder: 1, targetWordCount: 3000, content: "Draft" },
    contextBlocks: [{ id: "mission", group: "chapter_mission", required: true, priority: 100, estimatedTokens: 10, content: "Old mission" }],
    options: { provider: "openai", temperature: 0.2, maxTokens: 1600 },
  };
  return { input, config, modelReads: () => modelReads };
}

test("effective prompt identity changes for input, selected context, policy, schema, slot, template and resolved defaults", async (t) => {
  const { input, config } = fixture(t);
  const initial = await runner.prepareStructuredPromptExecution(input);
  assert.match(initial.identityDigest, /^[a-f0-9]{64}$/);
  assert.equal((await runner.prepareStructuredPromptExecution(input)).identityDigest, initial.identityDigest);
  for (const [field, value] of Object.entries({ novelTitle: "Other book", chapterTitle: "Departure", chapterOrder: 2, targetWordCount: 4000, content: "Other draft" })) {
    const oldValue = input.promptInput[field];
    input.promptInput[field] = value;
    assert.notEqual((await runner.prepareStructuredPromptExecution(input)).identityDigest, initial.identityDigest, field);
    input.promptInput[field] = oldValue;
  }
  for (const [field, value] of Object.entries({ model: "gpt-4.1", protocol: "responses", addendum: "new slot", template: "new template" })) {
    const oldValue = config[field];
    config[field] = value;
    assert.notEqual((await runner.prepareStructuredPromptExecution(input)).identityDigest, initial.identityDigest, field);
    config[field] = oldValue;
  }
  input.contextBlocks[0].content = "Other mission";
  assert.notEqual((await runner.prepareStructuredPromptExecution(input)).identityDigest, initial.identityDigest);
  input.contextBlocks[0].content = "Old mission";
  input.asset.contextPolicy = { ...input.asset.contextPolicy, maxTokensBudget: 9000 };
  const changedPolicy = await runner.prepareStructuredPromptExecution(input);
  assert.notEqual(changedPolicy.identityDigest, initial.identityDigest);
  input.asset.outputSchema = z.object({ value: z.string(), extra: z.string() });
  assert.notEqual((await runner.prepareStructuredPromptExecution(input)).identityDigest, changedPolicy.identityDigest);
});

test("prepared execution and semantic retry retain the prompt, schema, input and model plan despite caller mutations", async (t) => {
  const { input, config, modelReads } = fixture(t);
  input.asset.semanticRetryPolicy = { maxAttempts: 1 };
  input.asset.postValidate = (output, value, context) => {
    assert.equal(value.novelTitle, "Book");
    assert.equal(context.slots.text("fixture"), "old slot");
    if (output.value !== "good") throw new Error("Try the expected value");
    return output;
  };
  const prepared = await runner.prepareStructuredPromptExecution(input);
  const reads = modelReads();
  input.promptInput.novelTitle = "Modified";
  input.asset.outputSchema = z.object({ changed: z.string() });
  input.asset.postValidate = () => { throw new Error("Caller mutation leaked"); };
  input.asset.semanticRetryPolicy.maxAttempts = 0;
  config.addendum = "new slot";
  config.template = "new template";
  config.model = "gpt-4.1";
  const calls = [];
  runner.setPromptRunnerStructuredInvokerForTests(async (request) => {
    calls.push(request);
    return { data: { value: calls.length === 1 ? "bad" : "good" }, repairUsed: false, repairAttempts: 0 };
  });
  try {
    const result = await runner.runPreparedStructuredPrompt(prepared);
    assert.equal(result.output.value, "good");
    assert.equal(result.meta.invocation.semanticRetryAttempts, 1);
    assert.equal(modelReads(), reads);
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(call.preparedInvocation, prepared.preparedInvocation);
      assert.equal(call.schema.safeParse({ value: "good" }).success, true);
      assert.match(String(call.messages[0].content), /Book/);
      assert.match(String(call.messages[0].content), /Old mission/);
      assert.match(String(call.messages[0].content), /old slot/);
      assert.ok(call.messages.some((message) => message.content === "old template"));
    }
  } finally { runner.setPromptRunnerStructuredInvokerForTests(); }
});

test("a schema that cannot be described safely remains executable but is excluded from reuse", async (t) => {
  const { input } = fixture(t);
  input.asset.outputSchema = z.object({ value: z.string().transform((value) => value.toUpperCase()) });
  const prepared = await runner.prepareStructuredPromptExecution(input);
  assert.equal(prepared.identityDigest, null);
  assert.ok(prepared.preparedInvocation);
});
