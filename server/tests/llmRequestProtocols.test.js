function sendResponsesStream(res, text, model, terminalStatus = "completed") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      });
      const events = [
        {
          type: "response.created",
          sequence_number: 0,
          response: buildResponsesPayload("", model, "in_progress"),
        },
        {
          type: "response.output_item.added",
          sequence_number: 1,
          output_index: 0,
          item: {
            id: "msg_contract_test",
            type: "message",
            status: "in_progress",
            role: "assistant",
            content: [],
          },
        },
        {
          type: "response.output_text.delta",
          sequence_number: 2,
          item_id: "msg_contract_test",
          output_index: 0,
          content_index: 0,
          delta: text,
          logprobs: [],
        },
        {
          type: `response.${terminalStatus}`,
          sequence_number: 3,
          response: { ...buildResponsesPayload(text, model, terminalStatus), ...(terminalStatus === "incomplete" ? { incomplete_details: { reason: "max_output_tokens" } } : {}) },
        },
      ];
      for (const event of events) {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      }
      res.end();
}

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { z } = require("zod");
const { createOpenAIProtocolClient } = require("../dist/llm/protocols/OpenAIProtocolClient.js");
const {
  getAutomaticProtocolCandidates,
  normalizeModelRequestProtocol,
  resolveEffectiveModelRequestProtocol,
} = require("../dist/llm/protocols/requestProtocol.js");
const {
  resolveLLMClientOptions,
  setProviderSecretCache,
} = require("../dist/llm/factory.js");
const { llmConnectivityService } = require("../dist/llm/connectivity.js");
const { refreshProviderModels } = require("../dist/llm/modelCatalog.js");
const { extractLlmTokenUsage } = require("../dist/llm/usageTracking.js");

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function readJsonRequest(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function buildResponsesPayload(text, model, status = "completed") {
  return {
    id: "resp_contract_test",
    object: "response",
    created_at: 1_700_000_000,
    status,
    background: false,
    billing: { payer: "developer" },
    error: null,
    incomplete_details: null,
    instructions: null,
    max_output_tokens: 64,
    max_tool_calls: null,
    model,
    output: status === "completed" ? [{
      id: "msg_contract_test",
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{
        type: "output_text",
        text,
        annotations: [],
        logprobs: [],
      }],
    }] : [],
    parallel_tool_calls: true,
    previous_response_id: null,
    prompt_cache_key: null,
    prompt_cache_retention: null,
    reasoning: { effort: null, summary: null },
    safety_identifier: null,
    service_tier: "default",
    store: false,
    temperature: 0.2,
    text: { format: { type: "text" }, verbosity: "medium" },
    tool_choice: "auto",
    tools: [],
    top_logprobs: 0,
    top_p: 1,
    truncation: "disabled",
    usage: status !== "in_progress" ? {
      input_tokens: 11,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 7,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 18,
    } : null,
    user: null,
    metadata: {},
  };
}

function contentToText(content) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content.map((part) => typeof part === "string" ? part : part?.text ?? "").join("");
}

test("request protocol precedence and automatic candidates are deterministic", () => {
  assert.equal(normalizeModelRequestProtocol("openai_responses"), "openai_responses");
  assert.equal(normalizeModelRequestProtocol("unknown"), "auto");
  assert.equal(resolveEffectiveModelRequestProtocol({
    requestProtocol: "auto",
    providerRequestProtocol: "openai_responses",
  }), "openai_responses");
  assert.equal(resolveEffectiveModelRequestProtocol({
    requestProtocol: "openai_compatible",
    providerRequestProtocol: "openai_responses",
  }), "openai_compatible");
  assert.deepEqual(getAutomaticProtocolCandidates({
    provider: "openai",
    preferred: "openai_responses",
  }), ["openai_responses", "openai_compatible", "anthropic"]);
});

test("provider defaults are inherited while an explicit route protocol wins", async () => {
  setProviderSecretCache("openai", {
    key: "test-key",
    model: "gpt-4o-mini",
    baseURL: "http://127.0.0.1:9/v1",
    requestProtocol: "openai_responses",
  });
  try {
    const inherited = await resolveLLMClientOptions("openai", { requestProtocol: "auto" });
    assert.equal(inherited.requestProtocol, "openai_responses");
    const explicit = await resolveLLMClientOptions("openai", {
      requestProtocol: "openai_compatible",
    });
    assert.equal(explicit.requestProtocol, "openai_compatible");
  } finally {
    setProviderSecretCache("openai", null);
  }
});

test("custom providers load CLIProxyAPI-style model ids from /v1/models", async () => {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({ url: req.url, authorization: req.headers.authorization });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      object: "list",
      data: [
        { id: "gpt-5-mini", object: "model" },
        { id: "qwen3-coder", object: "model" },
      ],
    }));
  });
  const port = await listen(server);

  try {
    const models = await refreshProviderModels(
      "custom_cli_proxy",
      "catalog-key",
      `http://127.0.0.1:${port}/v1`,
    );
    assert.deepEqual(models, ["gpt-5-mini", "qwen3-coder"]);
    assert.deepEqual(requests, [{
      url: "/v1/models",
      authorization: "Bearer catalog-key",
    }]);
  } finally {
    await close(server);
  }
});

test("automatic connectivity probing requires plain and structured calls to share one protocol", async () => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const body = await readJsonRequest(req);
    requests.push({ url: req.url, body });

    if (req.url === "/v1/chat/completions") {
      const isStructured = body.response_format != null
        || body.messages?.some((message) => String(message.content).includes("合法 JSON"));
      if (isStructured) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "structured output is unsupported" } }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        id: "chat_probe",
        object: "chat.completion",
        created: 1_700_000_000,
        model: body.model,
        choices: [{
          index: 0,
          finish_reason: "stop",
          message: { role: "assistant", content: "ok" },
        }],
        usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
      }));
      return;
    }

    if (req.url === "/v1/responses") {
      if (body.stream) {
        sendResponsesStream(res, JSON.stringify({ status: "ok" }), body.model);
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(buildResponsesPayload(
        JSON.stringify({ status: "ok" }),
        body.model,
      )));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "unsupported protocol" } }));
  });
  const port = await listen(server);
  setProviderSecretCache("custom_preview", {
    key: "probe-key",
    model: "probe-model",
    baseURL: `http://127.0.0.1:${port}/v1`,
    requestProtocol: "auto",
  });

  try {
    const result = await llmConnectivityService.testConnection({
      provider: "custom_preview",
      apiKey: "probe-key",
      model: "probe-model",
      baseURL: `http://127.0.0.1:${port}/v1`,
      requestProtocol: "auto",
      probeMode: "both",
    });

    assert.equal(result.plain?.ok, true);
    assert.equal(result.structured?.ok, true);
    assert.equal(result.plain?.requestProtocol, "openai_responses");
    assert.equal(result.structured?.requestProtocol, "openai_responses");
    assert.ok(requests.some((request) => request.url === "/v1/chat/completions"));
    assert.ok(requests.some((request) => request.url === "/v1/responses"));
  } finally {
    setProviderSecretCache("custom_preview", null);
    await close(server);
  }
});

test("Responses API supports plain, structured, streaming, usage, and store=false", async () => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const body = await readJsonRequest(req);
    requests.push({ url: req.url, authorization: req.headers.authorization, body });
    assert.equal(req.url, "/v1/responses");

    const text = body.text?.format?.type === "json_schema"
      ? JSON.stringify({ status: "ok" })
      : body.stream
        ? "streamed response"
        : "plain response";
    if (body.stream) {
      sendResponsesStream(res, text, body.model);
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(buildResponsesPayload(text, body.model)));
  });
  const port = await listen(server);

  try {
    const llm = createOpenAIProtocolClient({
      apiKey: "responses-key",
      model: "gpt-4o-mini",
      temperature: 0.2,
      maxTokens: 64,
      configuration: { baseURL: `http://127.0.0.1:${port}/v1` },
    }, "openai_responses");

    const plain = await llm.invoke("hello");
    assert.equal(contentToText(plain.content), "plain response");
    assert.deepEqual(extractLlmTokenUsage(plain), {
      promptTokens: 11,
      completionTokens: 7,
      reasoningTokens: 0,
      totalTokens: 18,
    });

    const structured = await llm.withStructuredOutput(
      z.object({ status: z.literal("ok") }),
      { name: "connectivity_probe", method: "jsonSchema", strict: true },
    ).invoke("return JSON");
    assert.deepEqual(structured, { status: "ok" });

    let streamed = "";
    for await (const chunk of await llm.stream("stream this")) {
      streamed += contentToText(chunk.content);
    }
    assert.equal(streamed, "streamed response");

    assert.equal(requests.length, 3);
    assert.ok(requests.every((request) => request.authorization === "Bearer responses-key"));
    assert.ok(requests.every((request) => request.body.store === false));
    assert.ok(requests.every((request) => request.body.max_output_tokens === 64));
    assert.equal(requests[1].body.text.format.type, "json_schema");
    assert.equal(requests[2].body.stream, true);
  } finally {
    await close(server);
  }
});

test("explicit Chat Completions never switches to Responses for a preferred model", async () => {
  const paths = [];
  const server = http.createServer(async (req, res) => {
    const body = await readJsonRequest(req);
    paths.push(req.url);
    assert.equal(req.url, "/v1/chat/completions");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      id: "chatcmpl_contract_test",
      object: "chat.completion",
      created: 1_700_000_000,
      model: body.model,
      choices: [{
        index: 0,
        message: { role: "assistant", content: "chat response" },
        finish_reason: "stop",
        logprobs: null,
      }],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    }));
  });
  const port = await listen(server);
  try {
    const llm = createOpenAIProtocolClient({
      apiKey: "chat-key",
      model: "gpt-5-codex",
      configuration: { baseURL: `http://127.0.0.1:${port}/v1` },
    }, "openai_compatible");
    const response = await llm.invoke("stay on chat completions");
    assert.equal(contentToText(response.content), "chat response");
    assert.deepEqual(paths, ["/v1/chat/completions"]);
  } finally {
    await close(server);
  }
});

test("Responses incomplete terminal survives LangChain conversion and keeps known usage", async () => {
  const { readStreamTerminal } = require("../dist/llm/streamOutcome/index.js");
  const server = http.createServer(async (req, res) => {
    const body = await readJsonRequest(req);
    sendResponsesStream(res, "没有写完的正文", body.model, "incomplete");
  });
  const port = await listen(server);
  try {
    const llm = createOpenAIProtocolClient({ apiKey: "test", model: "gpt-4o-mini", maxRetries: 0, configuration: { baseURL: `http://127.0.0.1:${port}/v1` } }, "openai_responses");
    const chunks = [];
    for await (const chunk of await llm.stream("write")) chunks.push(chunk);
    const terminal = chunks.find(chunk => readStreamTerminal(chunk) === "output_limit");
    assert.ok(terminal);
    assert.equal(terminal.response_metadata.status, "incomplete");
    assert.equal(terminal.response_metadata.incomplete_details.reason, "max_output_tokens");
    assert.equal(extractLlmTokenUsage(terminal).totalTokens, 18);
  } finally { await close(server); }
});
