const test = require("node:test");
const assert = require("node:assert/strict");
const { createProviderModelLimiter, attachLLMRequestLimiter } = require("../dist/llm/requestLimiter.js");
const { BaseChatModel } = require("@langchain/core/language_models/chat_models");
const { AIMessage } = require("@langchain/core/messages");
const { ChatOpenAI } = require("@langchain/openai");
const http = require("node:http");

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const turn = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
let clientSequence = 0;
function limitedClient(stream, invoke = async input => input) {
  const client = { stream, invoke, batch(inputs, options) { return Promise.all(inputs.map(input => this.invoke(input, options))); } };
  return attachLLMRequestLimiter(client, { provider: "openai", model: `limiter-fixture-${++clientSequence}`, concurrencyLimit: 1 });
}

test("provider model limiter serializes calls when concurrency limit is one", async () => {
  const limiter = createProviderModelLimiter({
    provider: "openai",
    model: "glm-5",
    concurrencyLimit: 1,
    requestIntervalMs: 0,
  });
  let active = 0;
  let maxActive = 0;

  await Promise.all([
    limiter.run(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await wait(20);
      active -= 1;
    }),
    limiter.run(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await wait(20);
      active -= 1;
    }),
  ]);

  assert.equal(maxActive, 1);
});

test("provider model limiter spaces starts by the configured interval", async () => {
  const limiter = createProviderModelLimiter({
    provider: "openai",
    model: "glm-5",
    concurrencyLimit: 0,
    requestIntervalMs: 30,
  });
  const starts = [];

  await Promise.all([
    limiter.run(async () => {
      starts.push(Date.now());
    }),
    limiter.run(async () => {
      starts.push(Date.now());
    }),
  ]);

  starts.sort((a, b) => a - b);
  assert.ok(starts[1] - starts[0] >= 25, `expected >=25ms gap, got ${starts[1] - starts[0]}ms`);
});

test("queued cancellation rejects immediately and never starts its request", async () => {
  const limiter = createProviderModelLimiter({ provider: "openai", model: "queue-abort", concurrencyLimit: 1 });
  const permit = await limiter.acquire();
  const controller = new AbortController();
  const reason = new Error("cancel queued request");
  let started = false;
  const queued = limiter.run(() => { started = true; }, controller.signal);
  controller.abort(reason);
  await assert.rejects(queued, error => error === reason);
  permit.release();
  await turn();
  assert.equal(started, false);
  await limiter.run(() => {});
});

test("already aborted calls and synchronous failures cannot leak a permit", async () => {
  const limiter = createProviderModelLimiter({ provider: "openai", model: "throws", concurrencyLimit: 1 });
  const signal = AbortSignal.abort(new Error("already cancelled"));
  let started = false;
  await assert.rejects(limiter.run(() => { started = true; }, signal), /already cancelled/);
  assert.equal(started, false);
  await assert.rejects(limiter.run(() => { throw new Error("synchronous failure"); }), /synchronous failure/);
  assert.equal(await limiter.run(() => "next"), "next");
});

test("releasing a permit twice never admits an extra concurrent request", async () => {
  const limiter = createProviderModelLimiter({ provider: "openai", model: "idempotent", concurrencyLimit: 1 });
  const first = await limiter.acquire();
  const secondPending = limiter.acquire();
  let thirdStarted = false;
  const thirdPending = limiter.acquire().then(permit => { thirdStarted = true; return permit; });
  first.release();
  first.release();
  const second = await secondPending;
  await turn();
  assert.equal(thirdStarted, false);
  second.release();
  (await thirdPending).release();
});

test("a cancelled interval waiter does not consume a start or leave its timer alive", async () => {
  const limiter = createProviderModelLimiter({ provider: "openai", model: "interval-abort", requestIntervalMs: 30 });
  await limiter.run(() => {});
  const controller = new AbortController();
  const pending = limiter.run(() => assert.fail("cancelled interval request started"), controller.signal);
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(limiter.queue.length, 0);
  assert.equal(limiter.timer, null);
});

test("stream creation holds capacity until all chunks including usage are consumed", async () => {
  const usage = { content: "", usage_metadata: { input_tokens: 3, output_tokens: 5, total_tokens: 8 } };
  const first = { content: "draft" };
  let invokeStarted = false;
  const client = limitedClient(async () => (async function* () { yield first; yield usage; })(), async () => { invokeStarted = true; });
  const stream = await client.stream("write");
  const pending = client.invoke("next");
  await turn();
  assert.equal(invokeStarted, false);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  assert.deepEqual(chunks, [first, usage]);
  assert.equal(chunks[1], usage, "usage chunks must pass through unchanged");
  await pending;
  assert.equal(invokeStarted, true);
});

test("stream setup rejection releases capacity and queued stream abort never opens a provider", async () => {
  let opens = 0;
  const client = limitedClient(async () => { opens++; throw new Error("setup rejected"); });
  await assert.rejects(client.stream("bad"), /setup rejected/);
  assert.equal(await client.invoke("next"), "next");
  const hold = deferred();
  const active = limitedClient(async () => { opens++; return (async function* () {})(); }, () => hold.promise);
  const running = active.invoke("hold");
  await turn();
  const controller = new AbortController();
  const queued = active.stream("queued", { signal: controller.signal });
  controller.abort(new Error("queued stream cancelled"));
  await assert.rejects(queued, /queued stream cancelled/);
  assert.equal(opens, 1);
  hold.resolve();
  await running;
});

test("early loop return waits for provider cleanup before admitting another request", async () => {
  const cleanup = deferred();
  const closing = deferred();
  let closed = false;
  let nextStarted = false;
  const client = limitedClient(async () => (async function* () {
    try { yield "first"; yield "second"; }
    finally { closing.resolve(); await cleanup.promise; closed = true; }
  })(), async () => { nextStarted = true; });
  const stream = await client.stream("write");
  const consumed = (async () => { for await (const chunk of stream) { assert.equal(chunk, "first"); break; } })();
  await closing.promise;
  const next = client.invoke("next");
  await turn();
  assert.equal(nextStarted, false);
  cleanup.resolve();
  await consumed;
  await next;
  assert.equal(closed, true);
});

test("stream failure preserves the error and holds capacity through cleanup", async () => {
  const cleanup = deferred();
  const failed = new Error("provider failed after usage");
  let nextStarted = false;
  let cancelled = 0;
  const source = {
    async *[Symbol.asyncIterator]() { yield { usage_metadata: { total_tokens: 9 } }; throw failed; },
    async cancel() { cancelled++; await cleanup.promise; },
  };
  const client = limitedClient(async () => source, async () => { nextStarted = true; });
  const stream = await client.stream("write");
  assert.deepEqual((await stream.next()).value, { usage_metadata: { total_tokens: 9 } });
  await assert.rejects(stream.next(), error => error === failed);
  const next = client.invoke("next");
  await turn();
  assert.equal(nextStarted, false);
  cleanup.resolve();
  await next;
  assert.equal(cancelled, 1);
});

for (const method of ["cancel", "return"]) {
  test(`pre-consumption ${method} reaches the provider and awaits its shutdown`, async () => {
    const cleanup = deferred();
    let cancelled = 0;
    let nextStarted = false;
    const source = { async *[Symbol.asyncIterator]() { assert.fail("pre-cancelled source was read"); }, async cancel() { cancelled++; await cleanup.promise; } };
    const client = limitedClient(async () => source, async () => { nextStarted = true; });
    const stream = await client.stream("write");
    const stopped = stream[method]();
    const next = client.invoke("next");
    await turn();
    assert.equal(nextStarted, false);
    assert.equal(cancelled, 1);
    cleanup.resolve();
    await stopped;
    await next;
  });
}

test("caller abort closes an unconsumed active stream and holds its permit until close settles", async () => {
  const cleanup = deferred();
  let closed = false;
  let nextStarted = false;
  const source = { async *[Symbol.asyncIterator]() { yield "unused"; }, async cancel() { await cleanup.promise; closed = true; } };
  const client = limitedClient(async () => source, async () => { nextStarted = true; });
  const controller = new AbortController();
  const reason = new Error("active stream cancelled");
  const stream = await client.stream("write", { signal: controller.signal });
  controller.abort(reason);
  await assert.rejects(stream.next(), error => error === reason);
  const next = client.invoke("next");
  await turn();
  assert.equal(nextStarted, false);
  cleanup.resolve();
  await next;
  assert.equal(closed, true);
});

test("stream keeps the ReadableStream reader and pipe APIs", async () => {
  const client = limitedClient(async () => (async function* () { yield "a"; yield "b"; })());
  const stream = await client.stream("reader");
  const reader = stream.getReader();
  assert.deepEqual(await reader.read(), { done: false, value: "a" });
  await reader.cancel();
  reader.releaseLock();
  const piped = await client.stream("pipe");
  const chunks = [];
  await piped.pipeTo(new WritableStream({ write(chunk) { chunks.push(chunk); } }));
  assert.deepEqual(chunks, ["a", "b"]);
});

class OfflineChatModel extends BaseChatModel {
  constructor() { super({}); this.starts = []; this.active = 0; this.maxActive = 0; }
  _llmType() { return "offline-limiter-fixture"; }
  async _generate(messages) {
    this.active++;
    this.maxActive = Math.max(this.maxActive, this.active);
    const text = messages[0].content;
    this.starts.push(text);
    await turn();
    this.active--;
    if (text === "reject") throw new Error("offline request failed");
    return { generations: [{ text, message: new AIMessage(text) }] };
  }
}

test("installed LangChain batch limits individual invokes without a limit-one deadlock", { timeout: 2000 }, async () => {
  const model = new OfflineChatModel();
  attachLLMRequestLimiter(model, { provider: "openai", model: `batch-${++clientSequence}`, concurrencyLimit: 1 });
  const output = await model.batch(["one", "reject", "three"], undefined, { returnExceptions: true });
  assert.equal(output[0].content, "one");
  assert.match(output[1].message, /offline request failed/);
  assert.equal(output[2].content, "three");
  assert.deepEqual(model.starts, ["one", "reject", "three"]);
  assert.equal(model.maxActive, 1);
});

test("installed LangChain disabled-stream invoke adapter shares its outer permit", { timeout: 2000 }, async () => {
  const model = new OfflineChatModel();
  model.disableStreaming = true;
  attachLLMRequestLimiter(model, { provider: "openai", model: `disabled-stream-${++clientSequence}`, concurrencyLimit: 1 });
  const stream = await model.stream("one");
  let secondDone = false;
  const next = model.invoke("two").then(() => { secondDone = true; });
  await turn();
  assert.equal(secondDone, false);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk.content);
  assert.deepEqual(chunks, ["one"]);
  await next;
  assert.deepEqual(model.starts, ["one", "two"]);
});

test("actual ChatOpenAI cancellation aborts a stalled transport before awaiting iterator return", { timeout: 3000 }, async t => {
  const closed = deferred();
  let requests = 0;
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    requests++;
    if (input.stream) {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(`data: ${JSON.stringify({ id: "offline", object: "chat.completion.chunk", created: 0, model: "offline", choices: [{ index: 0, delta: { role: "assistant", content: "first" }, finish_reason: null }] })}\n\n`);
      response.on("close", () => closed.resolve());
    } else {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: "next", object: "chat.completion", created: 0, model: "offline", choices: [{ index: 0, message: { role: "assistant", content: "next" }, finish_reason: "stop" }] }));
    }
  });
  t.after(() => { server.closeAllConnections(); server.close(); });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const client = new ChatOpenAI({ apiKey: "offline-fixture", model: "offline", maxRetries: 0, configuration: { baseURL: `http://127.0.0.1:${server.address().port}/v1` } });
  attachLLMRequestLimiter(client, { provider: "openai", model: `sdk-cancel-${++clientSequence}`, concurrencyLimit: 1 });
  const stream = await client.stream("write");
  assert.equal((await stream.next()).value.content, "first");
  const pendingRead = stream.next();
  const pendingReadResult = pendingRead.catch(error => error);
  await turn();
  const next = client.invoke("next");
  await stream.return();
  await closed.promise;
  await pendingReadResult;
  assert.equal((await next).content, "next");
  assert.equal(requests, 2);
});

test("usage and debug observers forward prestart cancellation and preserve cumulative usage once", async () => {
  const dbPath = require.resolve("../dist/db/prisma.js");
  const previousDb = require.cache[dbPath];
  const recorded = [];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { prisma: { novelWorkflowTask: { updateMany: async input => { recorded.push(input); } } } } };
  const usagePath = require.resolve("../dist/llm/usageTracking.js");
  const previousUsage = require.cache[usagePath];
  delete require.cache[usagePath];
  let attachLLMUsageTracking;
  let runWithLlmUsageTracking;
  try { ({ attachLLMUsageTracking, runWithLlmUsageTracking } = require(usagePath)); }
  finally {
    if (previousDb) require.cache[dbPath] = previousDb; else delete require.cache[dbPath];
    if (previousUsage) require.cache[usagePath] = previousUsage; else delete require.cache[usagePath];
  }
  const { attachLLMDebugLogging } = require("../dist/llm/debugLogging.js");
  const oldLog = process.env.LLM_DEBUG_LOG;
  const oldFile = process.env.LLM_DEBUG_FILE_LOG;
  const consoleLog = console.info;
  process.env.LLM_DEBUG_LOG = "true";
  process.env.LLM_DEBUG_FILE_LOG = "false";
  console.info = () => {};
  try {
    let cancelled = 0;
    const finalUsage = { content: "", usage_metadata: { input_tokens: 3, output_tokens: 5, total_tokens: 8 } };
    const raw = {
      async *[Symbol.asyncIterator]() { yield { content: "draft" }; yield finalUsage; },
      async cancel() { cancelled++; },
    };
    const client = { invoke: async () => "next", stream: async () => raw, batch: async () => [] };
    attachLLMUsageTracking(client);
    attachLLMDebugLogging(client, { provider: "openai", model: "observed", temperature: 0 });
    attachLLMRequestLimiter(client, { provider: "openai", model: `observers-${++clientSequence}`, concurrencyLimit: 1 });
    await runWithLlmUsageTracking({ workflowTaskId: "fixture-task" }, async () => {
      const unopened = await client.stream("cancel before reading");
      await unopened.cancel();
      assert.equal(cancelled, 1);
      assert.equal(recorded.length, 0);
      const stream = await client.stream("read usage");
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      assert.equal(chunks[1], finalUsage);
      assert.equal(recorded.length, 1);
      assert.equal(recorded[0].data.llmCallCount.increment, 1);
      assert.equal(recorded[0].data.totalTokens.increment, 8);
      const partial = await client.stream("stop after usage");
      await partial.next();
      assert.equal((await partial.next()).value, finalUsage);
      await partial.return();
      assert.equal(recorded.length, 2, "early return records the observed cumulative usage exactly once");
      assert.equal(recorded[1].data.totalTokens.increment, 8);
    });
  } finally {
    console.info = consoleLog;
    if (oldLog === undefined) delete process.env.LLM_DEBUG_LOG; else process.env.LLM_DEBUG_LOG = oldLog;
    if (oldFile === undefined) delete process.env.LLM_DEBUG_FILE_LOG; else process.env.LLM_DEBUG_FILE_LOG = oldFile;
  }
});
