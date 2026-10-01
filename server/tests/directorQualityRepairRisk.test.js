const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildDirectorQualityRepairRisk,
} = require("../dist/services/novel/director/phases/novelDirectorQualityRepairRisk.js");
const {
  resolveQualityRepairNoticeAction,
} = require("../dist/services/novel/director/automation/novelDirectorAutoExecutionCheckpointRuntime.js");
const {
  stopAutoExecutionAtTokenBudgetBoundary,
} = require("../dist/services/novel/director/automation/novelDirectorAutoExecutionTokenBudgetRuntime.js");

test("buildDirectorQualityRepairRisk treats deferred quality debt as continuable regardless of count", () => {
  const risk = buildDirectorQualityRepairRisk({
    noticeCode: "PIPELINE_QUALITY_REVIEW",
    noticeSummary: "部分章节已记录质量债务",
    payload: JSON.stringify({
      repairMode: "heavy_repair",
      qualityAlertDetails: [
        "第3章（coherence=70）",
        "第4章（coherence=71）",
        "第5章（coherence=72）",
        "第6章（coherence=73）",
        "第7章（coherence=74）",
        "第8章（coherence=74）",
      ],
    }),
    remainingChapterCount: 2,
    totalChapterCount: 8,
  });

  assert.equal(risk.riskLevel, "low");
  assert.equal(risk.autoContinuable, true);
  assert.equal(risk.affectedChapterCount, 6);
  assert.match(risk.reason, /质量债务/);
});

test("buildDirectorQualityRepairRisk keeps replan notices blocking", () => {
  const risk = buildDirectorQualityRepairRisk({
    noticeCode: "PIPELINE_REPLAN_REQUIRED",
    noticeSummary: "第9章需要重规划",
    payload: JSON.stringify({
      replanAlertDetails: ["第9章需要重规划（原因=缺失比武环节）"],
    }),
    remainingChapterCount: 1,
    totalChapterCount: 8,
  });

  assert.equal(risk.riskLevel, "replan");
  assert.equal(risk.autoContinuable, false);
  assert.equal(risk.affectedChapterCount, 1);
});

test("buildDirectorQualityRepairRisk keeps unclassified heavy repair notices manual", () => {
  const risk = buildDirectorQualityRepairRisk({
    noticeSummary: "大范围修复需要确认",
    payload: JSON.stringify({ repairMode: "heavy_repair" }),
    remainingChapterCount: 3,
    totalChapterCount: 10,
  });

  assert.equal(risk.riskLevel, "large_scope");
  assert.equal(risk.autoContinuable, false);
});

test("payload-only recoverable repair debt is continuable and remains separate from explicit replan", () => {
  const debt = {
    repairMode: "heavy_repair",
    recoverableRepairDetails: ["第 1 章需要后续修复：局部修复未完成，正文已保留。"],
  };
  const input = { remainingChapterCount: 2, totalChapterCount: 3 };
  const continuable = buildDirectorQualityRepairRisk({ ...input, payload: JSON.stringify(debt) });
  assert.equal(continuable.autoContinuable, true);
  assert.equal(continuable.riskLevel, "low");
  assert.equal(continuable.affectedChapterCount, 1);

  const replan = buildDirectorQualityRepairRisk({
    ...input, noticeCode: "PIPELINE_QUALITY_REVIEW",
    payload: JSON.stringify({ ...debt, replanAlertDetails: ["第 1 章需要调整后续计划。"] }),
  });
  assert.equal(replan.autoContinuable, false);
  assert.equal(replan.riskLevel, "replan");
  assert.equal(replan.noticeCode, "PIPELINE_REPLAN_REQUIRED");
});

function qualityCheckpointInput(overrides = {}) {
  return {
    taskId: "task-1", novelId: "novel-1", pipelineJobId: "job-1", pipelineStatus: "succeeded",
    request: { runMode: "full_book_autopilot" },
    range: { totalChapterCount: 3 },
    autoExecution: { remainingChapterCount: 2, nextChapterId: "chapter-2", nextChapterOrder: 2 },
    noticeSummary: "当前章节正文已保留。",
    ...overrides,
  };
}

test("whole-book quality checkpoint continues local debt without promoting it into replan", async () => {
  const approvals = [];
  const result = await resolveQualityRepairNoticeAction({
    async recordAutoApproval(approval) { approvals.push(approval); },
  }, qualityCheckpointInput({
    noticeCode: "PIPELINE_QUALITY_REVIEW",
    payload: JSON.stringify({
      repairMode: "heavy_repair", qualityAlertDetails: ["第 1 章存在局部质量债。"],
      replanAlertDetails: [],
    }),
  }));
  assert.equal(result.action, "auto_continue");
  assert.equal(result.checkpointType, "chapter_batch_ready");
  assert.equal(result.qualityRepairRisk.riskLevel, "low");
  assert.equal(result.qualityRepairRisk.autoContinuable, true);
  assert.equal(approvals.length, 1);
});

test("explicit payload replan pauses whole-book execution despite a missing or stale notice", async (t) => {
  for (const noticeCode of [undefined, "PIPELINE_QUALITY_REVIEW", "PIPELINE_REPLAN_REQUIRED"]) {
    await t.test(noticeCode ?? "no notice", async () => {
      const approvals = [];
      const result = await resolveQualityRepairNoticeAction({
        async recordAutoApproval(approval) { approvals.push(approval); },
        async shouldAutoContinueQualityRepair() { return true; },
      }, qualityCheckpointInput({
        noticeCode,
        payload: JSON.stringify({
          qualityAlertDetails: ["第 1 章存在局部质量债。"],
          replanAlertDetails: ["第 1 章需要调整后续计划。"],
        }),
      }));
      assert.equal(result.qualityRepairRisk.riskLevel, "replan");
      assert.equal(result.qualityRepairRisk.autoContinuable, false);
      assert.equal(result.action, "pause");
      assert.equal(result.checkpointType, "replan_required");
      assert.deepEqual(approvals, []);
    });
  }
});

test("skip or scope approval cannot override an explicit replan decision", async (t) => {
  for (const options of [
    { skipCurrentQualityRepair: true },
    { approveAutoExecutionScope: true },
    { skipCurrentQualityRepair: true, approveAutoExecutionScope: true },
  ]) {
    await t.test(Object.keys(options).join(" + "), async () => {
      const approvals = [];
      const result = await resolveQualityRepairNoticeAction({
        async recordAutoApproval(approval) { approvals.push(approval); },
        async shouldAutoContinueQualityRepair() { return true; },
      }, qualityCheckpointInput({
        ...options,
        payload: JSON.stringify({ replanAlertDetails: ["第 1 章需要调整后续计划。"] }),
      }));
      assert.equal(result.action, "pause");
      assert.equal(result.checkpointType, "replan_required");
      assert.equal(result.qualityRepairRisk.autoContinuable, false);
      assert.deepEqual(approvals, []);
    });
  }
});

test("real book token budget exhaustion pauses at the chapter boundary without creating a replan", async () => {
  const checkpoints = [];
  const input = qualityCheckpointInput();
  const stopped = await stopAutoExecutionAtTokenBudgetBoundary({
    tokenBudgetService: {
      async evaluateBoundary() {
        return { status: "exhausted", usedTokens: 1000, limitTokens: 1000 };
      },
    },
    workflowService: {
      async recordCheckpoint(taskId, checkpoint) { checkpoints.push({ taskId, ...checkpoint }); },
    },
    buildDirectorSeedPayload(_request, novelId, extra) { return { novelId, ...extra }; },
  }, input);
  assert.equal(stopped, true);
  assert.equal(checkpoints.length, 1);
  assert.equal(checkpoints[0].checkpointType, "chapter_batch_ready");
  assert.equal(checkpoints[0].stage, "chapter_execution");
  assert.equal(checkpoints[0].chapterId, "chapter-2");
  assert.match(checkpoints[0].checkpointSummary, /Tokens 预算/);
  assert.equal(checkpoints[0].seedPayload.autoExecution.remainingChapterCount, 2);
});
