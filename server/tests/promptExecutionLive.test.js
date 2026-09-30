const test = require("node:test");
const assert = require("node:assert/strict");
const { HumanMessage } = require("@langchain/core/messages");
const { z } = require("zod");
const runner = require("../dist/prompting/core/promptRunner.js");
const { genreTreePrompt } = require("../dist/prompting/prompts/genre/genre.prompts.js");
const { llmLiveBroker } = require("../dist/platform/llm/live/LlmLiveBroker.js");

function asset(mode) {
  return {
    ...genreTreePrompt, mode, slots: [], management: undefined,
    maxOutputTokens: 80, maxRenderedInputTokens: 1000,
    repairPolicy: { maxAttempts: 0, maxSourceTokens: 200 },
    semanticRetryPolicy: { maxAttempts: 0 },
    outputSchema: mode === "structured" ? z.object({ value: z.string() }) : undefined,
    render: () => [new HumanMessage("写一段简短内容")],
    postValidate: (value) => value,
  };
}

for (const mode of ["text", "structured"]) {
  for (const streamed of mode === "text" ? [false, true] : [true]) {
    test(`${mode} ${streamed ? "stream" : "run"} forwards reasoning control and separates live reasoning from output`, async () => {
      const taskId = `u2-${mode}-${streamed}`;
      let options;
      runner.setPromptRunnerLLMFactoryForTests(async (_provider, supplied) => {
        options = supplied;
        return { stream: async () => ({ async *[Symbol.asyncIterator]() {
          yield { content: "", additional_kwargs: { reasoning_content: "先整理目标" } };
          yield { content: mode === "text" ? "正文" : '{"value":"正文"}', usage_metadata: {
            input_tokens: 12, output_tokens: 8, total_tokens: 20, output_token_details: { reasoning: 3 },
          } };
        } }) };
      });
      try {
        const input = { asset: asset(mode), promptInput: {}, options: { taskId, reasoningEnabled: false, maxTokens: 1000 } };
        const result = streamed
          ? await (mode === "text" ? runner.streamTextPrompt(input) : runner.streamStructuredPrompt(input))
          : await runner.runTextPrompt(input);
        if (streamed) for await (const _chunk of result.stream) { /* consume production stream */ }
        const completed = streamed ? await result.complete : result;
        assert.deepEqual(completed.output, mode === "text" ? "正文" : { value: "正文" });
        assert.equal(options.reasoningEnabled, false);
        assert.equal(options.maxTokens, 80);
        const [snapshot] = llmLiveBroker.getSnapshots({ taskId });
        assert.equal(snapshot.reasoning, "先整理目标");
        assert.equal(snapshot.preview.includes("先整理目标"), false);
        assert.equal(snapshot.phase, "completed");
        assert.ok(snapshot.firstResponseAt);
        assert.match(snapshot.context.promptText, /写一段简短内容/);
        assert.deepEqual(snapshot.tokenUsage, { promptTokens: 12, completionTokens: 8, reasoningTokens: 3, totalTokens: 20 });
      } finally { runner.setPromptRunnerLLMFactoryForTests(); }
    });
  }
}

test("structured invocation preserves reasoning and both repair/output budget contracts", async () => {
  let captured;
  runner.setPromptRunnerStructuredInvokerForTests(async (input) => {
    captured = input;
    return { data: { value: "正文" }, repairUsed: false, repairAttempts: 0, diagnostics: {} };
  });
  try {
    await runner.runStructuredPrompt({ asset: asset("structured"), promptInput: {}, options: { reasoningEnabled: false, maxTokens: 1000 } });
    assert.equal(captured.reasoningEnabled, false);
    assert.equal(captured.maxTokensCap, 80);
    assert.equal(captured.maxRepairSourceTokens, 200);
    assert.equal(captured.maxRepairAttempts, 0);
  } finally { runner.setPromptRunnerStructuredInvokerForTests(); }
});

for (const entry of ["runTextPrompt", "streamTextPrompt", "runStructuredPrompt", "streamStructuredPrompt"]) {
  test(`${entry} rejects the final rendered input budget before invoking a model`, async () => {
    let calls = 0;
    runner.setPromptRunnerLLMFactoryForTests(async () => { calls++; throw new Error("unexpected model call"); });
    runner.setPromptRunnerStructuredInvokerForTests(async () => { calls++; throw new Error("unexpected structured call"); });
    try {
      const prompt = asset(entry.includes("Structured") ? "structured" : "text");
      prompt.maxRenderedInputTokens = 1;
      await assert.rejects(runner[entry]({ asset: prompt, promptInput: {} }), /调用预算/);
      assert.equal(calls, 0);
    } finally {
      runner.setPromptRunnerLLMFactoryForTests();
      runner.setPromptRunnerStructuredInvokerForTests();
    }
  });
}
