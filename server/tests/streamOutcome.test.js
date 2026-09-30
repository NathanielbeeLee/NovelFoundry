const test = require("node:test");
const assert = require("node:assert/strict");
const { HumanMessage } = require("@langchain/core/messages");
const { EventEmitter } = require("node:events");
const { StreamExecutionScope, StreamOutcomeError, readStreamTerminal } = require("../dist/llm/streamOutcome/index.js");
const { captureStreamOutput } = require("../dist/prompting/core/execution/infrastructure/PromptStreamCapture.js");
const { normalizeResponsesApiStream } = require("../dist/llm/protocols/responsesCompatibility.js");
const { streamToSSE } = require("../dist/llm/streaming.js");
const runner = require("../dist/prompting/core/promptRunner.js");
const { genreTreePrompt } = require("../dist/prompting/prompts/genre/genre.prompts.js");
const source = (...chunks) => ({ async *[Symbol.asyncIterator]() { yield* chunks; } });
async function drain(captured) { let text = ""; for await (const chunk of captured.stream) text += chunk.content; return text; }
function scope(options = {}, signal) { return new StreamExecutionScope({ requireTerminal: true, firstResponseTimeoutMs: 100, idleTimeoutMs: 100, totalTimeoutMs: 500, ...options }, signal); }

test("protocol terminal parsing distinguishes completion, truncation and refusal", () => {
  for (const meta of [{ finish_reason: "stop" }, { stop_reason: "end_turn" }, { status: "completed" }]) assert.equal(readStreamTerminal({ response_metadata: meta }), "success");
  for (const meta of [{ finish_reason: "length" }, { stop_reason: "max_tokens" }, { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } }]) assert.equal(readStreamTerminal({ response_metadata: meta }), "output_limit");
  assert.equal(readStreamTerminal({ response_metadata: { status: "incomplete", incomplete_details: { reason: "content_filter" } } }), "interrupted");
  assert.equal(readStreamTerminal({ content: "完整正文" }), null);
});

test("strict capture strips inline reasoning and returns only confirmed text", async () => {
  const captured = captureStreamOutput(source({ content: "<think>思考</think>正文" }, { content: "结束", response_metadata: { finish_reason: "stop" } }), undefined, undefined, scope());
  assert.equal(await drain(captured), "正文结束");
  assert.equal(await captured.completedText, "正文结束");
});

for (const [name, terminal, kind] of [["missing", undefined, "interrupted"], ["length", "length", "output_limit"]]) {
  test(`${name} terminal preserves partial content and known usage without succeeding`, async () => {
    const captured = captureStreamOutput(source({ content: "未完成正文", response_metadata: { finish_reason: terminal }, usage_metadata: { input_tokens: 5, output_tokens: 4, total_tokens: 9 } }), undefined, undefined, scope());
    await assert.rejects(drain(captured), error => error instanceof StreamOutcomeError && error.kind === kind && error.partialContent === "未完成正文");
    await assert.rejects(captured.completedText, error => error.kind === kind);
    assert.equal((await captured.completedUsage).totalTokens, 9);
  });
}

for (const [kind, initial, options] of [["first_response_timeout", false, { firstResponseTimeoutMs: 8 }], ["idle_timeout", true, { idleTimeoutMs: 8 }], ["deadline", true, { totalTimeoutMs: 8 }]]) {
  test(`${kind} aborts an uncooperative transport and settles completion`, async () => {
    const execution = scope(options);
    const raw = { async *[Symbol.asyncIterator]() { if (initial) yield { content: "已生成足够长的部分正文" }; await new Promise(() => {}); } };
    const captured = captureStreamOutput(raw, undefined, undefined, execution);
    await assert.rejects(drain(captured), error => error.kind === kind);
    await assert.rejects(captured.completedText, error => error.kind === kind);
    assert.equal(execution.signal.aborted, true);
    if (initial) await assert.rejects(captured.completedText, error => error.partialContent === "已生成足够长的部分正文");
    await captured.completedUsage;
  });
}

test("upstream cancellation settles completion even before stream consumption", async () => {
  const controller = new AbortController();
  const execution = scope({}, controller.signal);
  const captured = captureStreamOutput(source({ content: "正文" }), undefined, undefined, execution);
  controller.abort();
  await assert.rejects(captured.completedText, error => error.kind === "cancelled");
  assert.equal(execution.signal.aborted, true);
});

test("consumer return aborts request and cannot resolve a partial stream as complete", async () => {
  const execution = scope();
  const captured = captureStreamOutput(source({ content: "正文第一部分足够长" }, { content: "下文", response_metadata: { finish_reason: "stop" } }), undefined, undefined, execution);
  for await (const _chunk of captured.stream) break;
  await assert.rejects(captured.completedText, error => error.kind === "cancelled");
  assert.equal(execution.signal.aborted, true);
});

test("Responses incomplete adapter keeps status, reason and usage for the converter", async () => {
  const events = [];
  for await (const event of normalizeResponsesApiStream(source({ type: "response.incomplete", response: { status: "incomplete", incomplete_details: { reason: "max_output_tokens" }, output_text: "半段正文", usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 } } }))) events.push(event);
  assert.equal(events[0].delta, "半段正文");
  const terminal = events.at(-1).response;
  assert.equal(terminal.status, "incomplete");
  assert.equal(terminal.incomplete_details.reason, "max_output_tokens");
  assert.equal(terminal.usage.total_tokens, 5);
});

test("strict text request first-response watchdog covers waiting for stream creation", async () => {
  let capturedSignal;
  let requests = 0;
  runner.setPromptRunnerLLMFactoryForTests(async (_provider, modelOptions) => { assert.equal(modelOptions.maxRetries, 0); return ({ stream: async (_messages, options) => { capturedSignal = options.signal; requests++; assert.equal(options.options.maxRetries, 0); return new Promise(() => {}); } }); });
  try {
    const asset = { ...genreTreePrompt, mode: "text", slots: [], management: undefined, outputSchema: undefined, render: () => [new HumanMessage("写正文")], postValidate: value => value };
    await assert.rejects(runner.streamTextPrompt({ asset, promptInput: {}, options: { streamPolicy: { requireTerminal: true, firstResponseTimeoutMs: 8 } } }), error => error.kind === "first_response_timeout");
    assert.equal(capturedSignal.aborted, true);
    assert.equal(requests, 1);
  } finally { runner.setPromptRunnerLLMFactoryForTests(); }
});

class FakeResponse extends EventEmitter {
  writableEnded = false; frames = [];
  setHeader() {} flushHeaders() {}
  write(frame) { this.frames.push(frame); }
  end() { this.writableEnded = true; }
}
test("chapter SSE disconnect cancels a blocked source and skips successful onDone", async () => {
  const res = new FakeResponse();
  let cancelled = false, finalized = false;
  const stream = { cancel() { cancelled = true; }, async *[Symbol.asyncIterator]() { yield { content: "部分" }; await new Promise(() => {}); } };
  const pending = streamToSSE(res, stream, async () => { finalized = true; });
  setTimeout(() => res.emit("close"), 5);
  await pending;
  assert.equal(cancelled, true);
  assert.equal(finalized, false);
  assert.equal(res.frames.some(frame => frame.includes('"type":"done"')), false);
});

test("Anthropic message terminal preserves stop_reason and cumulative usage", async () => {
  const { createAnthropicLLM } = require("../dist/llm/anthropicClient.js");
  const originalFetch = global.fetch;
  global.fetch = async () => new Response([
    { type: "message_start", message: { usage: { input_tokens: 9, output_tokens: 0 } } },
    { type: "content_block_delta", delta: { type: "text_delta", text: "部分正文" } },
    { type: "message_delta", delta: { stop_reason: "max_tokens" }, usage: { output_tokens: 5 } },
    { type: "message_stop" },
  ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
  try {
    const llm = createAnthropicLLM({ model: "test", baseURL: "http://test.invalid", temperature: 0.2 });
    const chunks = [];
    for await (const chunk of await llm.stream([new HumanMessage("write")])) chunks.push(chunk);
    assert.equal(chunks.map(chunk => chunk.content).join(""), "部分正文");
    const terminal = chunks.find(chunk => readStreamTerminal(chunk) === "output_limit");
    assert.equal(terminal.response_metadata.stop_reason, "max_tokens");
    assert.equal(terminal.usage_metadata.total_tokens, 14);
  } finally { global.fetch = originalFetch; }
});

test("SSE entry refuses an already destroyed connection without consuming or finalizing", async () => {
  const res = new FakeResponse(); res.destroyed = true;
  let cancelled = false, consumed = false, done = false;
  const stream = { cancel() { cancelled = true; }, async *[Symbol.asyncIterator]() { consumed = true; yield { content: "正文" }; } };
  await streamToSSE(res, stream, async () => { done = true; });
  assert.equal(cancelled, true); assert.equal(consumed, false); assert.equal(done, false);
});

for (const runtime of [false, true]) {
  test(`${runtime ? "runtime" : "legacy"} generation route aborts before the first model response`, async () => {
    const { registerNovelChapterGenerationRoutes } = require("../dist/modules/novel/production/http/novelChapterGeneration.js");
    const { stepModuleRunner } = require("../dist/services/novel/director/workflowStepRuntime/StepModuleRunner.js");
    const routes = new Map();
    registerNovelChapterGenerationRoutes({ router: { post(path, ...handlers) { routes.set(path, handlers.at(-1)); } }, chapterParamsSchema: require("zod").z.any(), forwardBusinessError: () => false });
    const original = stepModuleRunner.runStep;
    let observedSignal;
    stepModuleRunner.runStep = async (_id, input) => {
      observedSignal = runtime ? input.stepInput.options.signal : input.stepInput.signal;
      await new Promise((_resolve, reject) => observedSignal.addEventListener("abort", () => reject(observedSignal.reason), { once: true }));
    };
    const res = new FakeResponse();
    const nextCalls = [];
    try {
      const pending = routes.get(runtime ? "/:id/chapters/:chapterId/runtime/run" : "/:id/chapters/:chapterId/generate")({ params: { id: "n", chapterId: "c" }, body: {} }, res, error => nextCalls.push(error));
      res.destroyed = true; res.emit("close");
      await pending;
      assert.equal(observedSignal.aborted, true);
      assert.equal(nextCalls.length, 0);
      assert.equal(res.listenerCount("close"), 0);
    } finally { stepModuleRunner.runStep = original; }
  });
}
