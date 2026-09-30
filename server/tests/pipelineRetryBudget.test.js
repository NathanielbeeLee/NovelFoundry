const test = require("node:test");
const assert = require("node:assert/strict");
const { executeChapterWithRetryBudget } = require("../dist/services/novel/production/execution/index.js");
const { buildChapterEmptyContentError } = require("../dist/services/novel/runtime/chapterEmptyContentError.js");

test("empty generation spends the only retry and leaves no hidden quality retry", async () => {
  const attempts = [];
  const notices = [];
  const result = await executeChapterWithRetryBudget({
    options: { maxRetries: 9, batchPolishInstruction: "保持第一人称" },
    hooks: { onEmptyContent: async (event) => notices.push(event.willRetry) },
    run: async (options, hooks) => {
      attempts.push(options);
      if (attempts.length === 1) {
        const error = buildChapterEmptyContentError("", { source: "test" });
        await hooks.onEmptyContent({ attempt: 1, willRetry: false, error, contentLength: 0, rawContentLength: 0 });
        throw error;
      }
      return { pass: true, retryCountUsed: 0 };
    },
  });
  assert.deepEqual(attempts.map((item) => item.maxRetries), [1, 0]);
  assert.equal(attempts[1].batchPolishInstruction, "保持第一人称");
  assert.equal(result.retryCountUsed, 1);
  assert.deepEqual(notices, [true]);
});

test("interruption and uncertain persistence never replay a chapter", async () => {
  for (const error of [new Error("connection interrupted"), new Error("database write uncertain")]) {
    let calls = 0;
    await assert.rejects(() => executeChapterWithRetryBudget({
      options: { maxRetries: 1 }, hooks: {},
      run: async () => { calls += 1; throw error; },
    }), (value) => value === error);
    assert.equal(calls, 1);
  }
});

test("zero retry and cancellation before retry both prevent another generation", async () => {
  for (const maxRetries of [0, 1]) {
    let calls = 0;
    await assert.rejects(() => executeChapterWithRetryBudget({
      options: { maxRetries },
      hooks: { onCheckCancelled: async () => { throw new Error("cancelled"); } },
      run: async () => { calls += 1; throw buildChapterEmptyContentError("", { source: "test" }); },
    }));
    assert.equal(calls, 1);
  }
});
