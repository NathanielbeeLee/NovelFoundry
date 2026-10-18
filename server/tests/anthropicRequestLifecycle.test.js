const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { getEventListeners } = require("node:events");
const { HumanMessage } = require("@langchain/core/messages");
const { createAnthropicLLM } = require("../dist/llm/anthropicClient.js");

const messages = [new HumanMessage("write")];
const event = (value) => `data: ${JSON.stringify(value)}\n\n`;

async function withServer(handler, run) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}/v1`;
  try {
    await run((extra = {}) => createAnthropicLLM({
      model: "fixture", baseURL, temperature: 0, timeoutMs: 500, ...extra,
    }));
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

function streamHeaders(res) {
  res.writeHead(200, { "content-type": "text/event-stream" });
  res.flushHeaders();
}

async function collect(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return chunks;
}

test("Anthropic deadline covers an incomplete JSON body after headers", async () => {
  await withServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.write('{"content":[');
  }, async create => {
    const controller = new AbortController();
    await assert.rejects(create({ timeoutMs: 150 }).invoke(messages, { signal: controller.signal }),
      error => error.name === "TimeoutError");
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  });
});

test("Anthropic deadline covers stalled streaming consumption", async () => {
  await withServer((_req, res) => {
    streamHeaders(res);
    res.write(event({ type: "content_block_delta", delta: { type: "text_delta", text: "partial" } }));
  }, async create => {
    const controller = new AbortController();
    const chunks = [];
    await assert.rejects(async () => {
      for await (const chunk of await create({ timeoutMs: 150 }).stream(messages, { signal: controller.signal })) chunks.push(chunk);
    }, error => error.name === "TimeoutError");
    assert.equal(chunks.map(chunk => chunk.content).join(""), "partial");
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  });
});

test("Anthropic EOF without message_stop is interrupted even after a stop reason", async () => {
  await withServer((_req, res) => {
    streamHeaders(res);
    res.end(event({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 4 } }));
  }, async create => {
    await assert.rejects(collect(await create().stream(messages)), error => error.kind === "interrupted");
  });
});

test("Anthropic message_stop completes without waiting for socket EOF and preserves usage", async () => {
  await withServer((_req, res) => {
    streamHeaders(res);
    res.write([
      { type: "message_start", message: { usage: { input_tokens: 9, output_tokens: 0 } } },
      { type: "content_block_delta", delta: { type: "text_delta", text: "finished" } },
      { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 5 } },
      { type: "message_stop" },
    ].map(event).join(""));
  }, async create => {
    const controller = new AbortController();
    const chunks = await collect(await create({ timeoutMs: 200 }).stream(messages, { signal: controller.signal }));
    assert.equal(chunks.map(chunk => chunk.content).join(""), "finished");
    assert.equal(chunks.at(-1).usage_metadata.total_tokens, 14);
    assert.equal(chunks.at(-1).response_metadata.stop_reason, "end_turn");
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  });
});

test("Anthropic cancel and pre-consumption return close the underlying request", async () => {
  let closedCount = 0;
  let resolveClosed;
  let closed = new Promise(resolve => { resolveClosed = resolve; });
  await withServer((_req, res) => {
    res.once("close", () => { closedCount += 1; resolveClosed(); });
    streamHeaders(res);
  }, async create => {
    for (const method of ["cancel", "return"]) {
      const controller = new AbortController();
      const stream = await create().stream(messages, { signal: controller.signal });
      await stream[method]();
      await stream.cancel();
      await closed;
      assert.equal(getEventListeners(controller.signal, "abort").length, 0);
      closed = new Promise(resolve => { resolveClosed = resolve; });
    }
    assert.equal(closedCount, 2);
  });
});

test("Anthropic abort during a blocked read releases request resources", async () => {
  await withServer((_req, res) => { streamHeaders(res); }, async create => {
    const controller = new AbortController();
    const stream = await create().stream(messages, { signal: controller.signal });
    const pending = stream[Symbol.asyncIterator]().next();
    controller.abort();
    await assert.rejects(pending, error => error.name === "AbortError");
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  });
});

test("Anthropic successful invoke and provider errors remove the caller listener", async () => {
  let calls = 0;
  await withServer((_req, res) => {
    calls += 1;
    res.writeHead(calls === 1 ? 200 : 429, { "content-type": "application/json" });
    res.end(calls === 1 ? JSON.stringify({ content: [{ type: "text", text: "ok" }] }) : "rate limited");
  }, async create => {
    const controller = new AbortController();
    assert.equal((await create().invoke(messages, { signal: controller.signal })).content, "ok");
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    await assert.rejects(create().invoke(messages, { signal: controller.signal }), /429/);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  });
});

test("Anthropic already aborted calls never send an HTTP request", async () => {
  let calls = 0;
  await withServer((_req, res) => { calls += 1; res.end(); }, async create => {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(create().invoke(messages, { signal: controller.signal }), error => error.name === "AbortError");
    assert.equal(calls, 0);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  });
});
