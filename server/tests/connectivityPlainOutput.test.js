const test = require("node:test");
const assert = require("node:assert/strict");
const factory = require("../dist/llm/factory.js");
const { llmConnectivityService } = require("../dist/llm/connectivity.js");

test("plain connectivity requires visible final output", async (t) => {
  const cases = [
    { name: "empty output", response: { content: "" }, ok: false },
    { name: "whitespace output", response: { content: " \n\t" }, ok: false },
    { name: "missing output", response: {}, ok: false },
    {
      name: "native reasoning without a final answer",
      response: { content: "", additional_kwargs: { reasoning_content: "private reasoning" } },
      ok: false,
    },
    { name: "think tag output only", response: { content: "<think>private reasoning</think> \n" }, ok: false },
    { name: "unfinished thinking", response: { content: "<think>private reasoning" }, ok: false },
    {
      name: "reasoning text block only",
      response: { content: [{ type: "reasoning", text: "private reasoning" }] },
      ok: false,
    },
    { name: "plain final answer", response: { content: "ok" }, ok: true },
    {
      name: "visible text following think tags",
      response: { content: "<think>private reasoning</think>ok" },
      ok: true,
    },
    {
      name: "native final text blocks",
      response: { content: [{ type: "reasoning", text: "private reasoning" }, { type: "text", text: "ok" }] },
      ok: true,
    },
    { name: "Responses output text block", response: { content: [{ type: "output_text", text: "ok" }] }, ok: true },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, async (subtest) => {
      let invocations = 0;
      subtest.mock.method(factory, "resolveLLMClientOptions", async (provider, options) => ({
        provider,
        model: options.model,
        requestProtocol: options.requestProtocol,
      }));
      subtest.mock.method(factory, "getLLM", async (_provider, options) => {
        assert.equal(options.maxTokens, 16);
        return { invoke: async () => { invocations += 1; return fixture.response; } };
      });

      const result = await llmConnectivityService.testConnection({
        provider: "openai",
        model: "fixture-model",
        requestProtocol: "openai_compatible",
        probeMode: "plain",
      });

      assert.equal(invocations, 1);
      assert.equal(result.ok, fixture.ok);
      assert.equal(result.plain.ok, fixture.ok);
      assert.equal(result.requestProtocol, "openai_compatible");
      assert.equal(result.structured, null);
      if (fixture.ok) {
        assert.equal(result.error, null);
        assert.equal(typeof result.latency, "number");
      } else {
        assert.match(result.error, /模型未返回可见回复/);
        assert.equal(result.latency, null);
        assert.doesNotMatch(result.error, /private reasoning/);
      }
    });
  }
});
