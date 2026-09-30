const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildDirectorBookTokenBudgetSummary,
} = require("../dist/services/novel/director/runtime/usage/DirectorBookTokenBudgetService.js");
const {
  stopAutoExecutionAtTokenBudgetBoundary,
} = require("../dist/services/novel/director/automation/novelDirectorAutoExecutionTokenBudgetRuntime.js");

test("book token budget stays disabled without a configured limit", () => {
  const summary = buildDirectorBookTokenBudgetSummary({
    limitTokens: null,
    usedTokens: 120000,
    llmCallCount: 3,
  });
  assert.equal(summary.status, "disabled");
  assert.equal(summary.remainingTokens, null);
  assert.equal(summary.usageRatio, null);
});

test("book token budget warns and exhausts at deterministic boundaries", () => {
  const warning = buildDirectorBookTokenBudgetSummary({
    limitTokens: 100000,
    warnRatio: 0.8,
    usedTokens: 80000,
    llmCallCount: 2,
  });
  assert.equal(warning.status, "warning");
  assert.equal(warning.remainingTokens, 20000);

  const exhausted = buildDirectorBookTokenBudgetSummary({
    limitTokens: 100000,
    warnRatio: 0.8,
    usedTokens: 100001,
    llmCallCount: 3,
  });
  assert.equal(exhausted.status, "exhausted");
  assert.equal(exhausted.remainingTokens, 0);
});

test("exhausted book budget records a resumable non-replan checkpoint", async () => {
  let checkpoint = null;
  const stopped = await stopAutoExecutionAtTokenBudgetBoundary({
    workflowService: {
      recordCheckpoint: async (_taskId, input) => {
        checkpoint = input;
      },
    },
    buildDirectorSeedPayload: (_request, _novelId, extra) => extra,
    tokenBudgetService: {
      evaluateBoundary: async () => buildDirectorBookTokenBudgetSummary({
        limitTokens: 100000,
        warnRatio: 0.8,
        usedTokens: 100000,
        llmCallCount: 4,
      }),
    },
  }, {
    taskId: "task-1",
    novelId: "novel-1",
    request: { runMode: "full_book_autopilot" },
    range: { startOrder: 1, endOrder: 3, totalChapterCount: 3, firstChapterId: "chapter-1" },
    autoExecution: {
      enabled: true,
      mode: "chapter_range",
      startOrder: 1,
      endOrder: 3,
      remainingChapterCount: 2,
      remainingChapterIds: ["chapter-2", "chapter-3"],
      remainingChapterOrders: [2, 3],
      nextChapterId: "chapter-2",
      nextChapterOrder: 2,
    },
  });

  assert.equal(stopped, true);
  assert.equal(checkpoint.stage, "chapter_execution");
  assert.equal(checkpoint.checkpointType, "chapter_batch_ready");
  assert.equal(checkpoint.itemLabel, "Token 预算已用尽，等待调整");
  assert.match(checkpoint.checkpointSummary, /第 2 章开始前暂停/);
  assert.equal(checkpoint.seedPayload.autoExecution.nextChapterId, "chapter-2");
});

test("warning budget records no blocking checkpoint", async () => {
  let checkpointCount = 0;
  const stopped = await stopAutoExecutionAtTokenBudgetBoundary({
    workflowService: {
      recordCheckpoint: async () => {
        checkpointCount += 1;
      },
    },
    buildDirectorSeedPayload: (_request, _novelId, extra) => extra,
    tokenBudgetService: {
      evaluateBoundary: async () => buildDirectorBookTokenBudgetSummary({
        limitTokens: 100000,
        warnRatio: 0.8,
        usedTokens: 80000,
        llmCallCount: 3,
      }),
    },
  }, {
    taskId: "task-1",
    novelId: "novel-1",
    request: { runMode: "full_book_autopilot" },
    range: { startOrder: 1, endOrder: 2, totalChapterCount: 2, firstChapterId: "chapter-1" },
    autoExecution: {
      enabled: true,
      mode: "chapter_range",
      startOrder: 1,
      endOrder: 2,
      remainingChapterCount: 1,
      nextChapterId: "chapter-2",
      nextChapterOrder: 2,
    },
  });

  assert.equal(stopped, false);
  assert.equal(checkpointCount, 0);
});
