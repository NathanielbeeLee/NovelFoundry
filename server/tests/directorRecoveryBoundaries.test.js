const test = require("node:test");
const assert = require("node:assert/strict");
const { prisma } = require("../dist/db/prisma.js");
const { buildDirectorCompletionProfile } = require("@novelfoundry/shared/types/directorCompletion");
const { resolveAutoExecutionRangeAndState } = require("../dist/services/novel/director/automation/novelDirectorAutoExecutionScopeRuntime.js");
const { buildDirectorAutoExecutionPipelineOptions } = require("../dist/services/novel/director/automation/novelDirectorAutoExecution.js");
const { resolveSingleChapterExecutionRange } = require("../dist/services/novel/director/automation/novelDirectorAutoExecutionRuntimeUtils.js");
const { NovelDirectorAutoExecutionRuntime } = require("../dist/services/novel/director/automation/novelDirectorAutoExecutionRuntime.js");
const { NovelDirectorContinueRuntime } = require("../dist/services/novel/director/runtime/novelDirectorContinueRuntime.js");
const { applyDirectorRunModeContract } = require("../dist/services/novel/director/runtime/novelDirectorHelpers.js");
const { DirectorCommandLeaseService } = require("../dist/services/novel/director/commands/leases/DirectorCommandLeaseService.js");

const chapter = (order) => ({ id: `chapter-${order}`, order, content: `第${order}章正文`, generationState: "approved", chapterStatus: "completed" });
const request = { idea: "故事", candidate: { id: "c1", targetChapterCount: 12 }, runMode: "full_book_autopilot", autoExecutionPlan: { mode: "book" } };

test("rolling book scope keeps missing chapter orders and sends the planned upper bound", async () => {
  const resolved = await resolveAutoExecutionRangeAndState({
    novelId: "novel-1", deps: { listChapters: async () => [chapter(1), chapter(2)] },
    existingState: { enabled: true, mode: "book", completionProfile: buildDirectorCompletionProfile(12) },
    allowLazyChapterPlanning: true,
  });
  assert.equal(resolved.range.endOrder, 12);
  assert.equal(resolved.autoExecution.remainingChapterCount, 10);
  assert.equal(resolved.autoExecution.nextChapterOrder, 3);
  assert.equal(resolved.autoExecution.nextChapterId, null);
  const options = buildDirectorAutoExecutionPipelineOptions({
    ...resolveSingleChapterExecutionRange(resolved.range, resolved.autoExecution), targetEndChapter: resolved.range.endOrder,
  });
  assert.equal(options.startOrder, 3);
  assert.equal(options.endOrder, 3);
  assert.equal(options.targetEndChapter, 12);
});

test("explicit smaller chapter range survives full-book mode and limits remaining work", async () => {
  const normalized = applyDirectorRunModeContract({ ...request, autoExecutionPlan: { mode: "chapter_range", startOrder: 1, endOrder: 3 } });
  assert.equal(normalized.autoExecutionPlan.endOrder, 3);
  const resolved = await resolveAutoExecutionRangeAndState({
    novelId: "novel-1", deps: { listChapters: async () => [chapter(1), chapter(2)] },
    existingState: { ...normalized.autoExecutionPlan, enabled: true, completionProfile: buildDirectorCompletionProfile(80) },
    allowLazyChapterPlanning: true,
  });
  assert.deepEqual(resolved.autoExecution.remainingChapterOrders, [3]);
  assert.equal(resolved.range.endOrder, 3);
});

test("polling a manually paused pipeline preserves recovery and never resumes it", async () => {
  const calls = [];
  const runtime = new NovelDirectorAutoExecutionRuntime({
    novelContextService: { listChapters: async () => [chapter(1)] },
    novelService: {
      getPipelineJobById: async () => ({ id: "paused", status: "queued", progress: 0.6, pendingManualRecovery: true }),
      resumePipelineJob: async () => { throw new Error("automatic resume forbidden"); },
      startPipelineJob: async () => { throw new Error("new pipeline forbidden"); },
    },
    workflowService: {
      requeueTaskForRecovery: async (...args) => calls.push(["recover", ...args]),
      bootstrapTask: async (input) => calls.push(["snapshot", input]),
    },
    buildDirectorSeedPayload: (_request, _novelId, extra) => extra,
  });
  await runtime.runFromReady({ taskId: "t1", novelId: "novel-1", request, existingPipelineJobId: "paused", existingState: { enabled: true, mode: "book" } });
  assert.equal(calls[0][0], "recover");
  assert.equal(calls[1][1].seedPayload.directorSession.isBackgroundRunning, false);
});

test("a claim lost to manual pause never starts or resolves the command", async (t) => {
  const originals = { findFirst: prisma.directorRunCommand.findFirst, updateMany: prisma.directorRunCommand.updateMany, findUnique: prisma.directorRunCommand.findUnique };
  t.after(() => Object.assign(prisma.directorRunCommand, originals));
  prisma.directorRunCommand.findFirst = async (args) => { assert.equal(args.where.task.pendingManualRecovery, false); return { id: "queued" }; };
  prisma.directorRunCommand.updateMany = async (args) => { assert.equal(args.where.task.pendingManualRecovery, false); return { count: 0 }; };
  prisma.directorRunCommand.findUnique = async () => { throw new Error("unclaimed command must not execute"); };
  assert.equal(await new DirectorCommandLeaseService({}).leaseNextCommand({ workerId: "w1", leaseMs: 1000 }), null);
});

test("replan recovery uses first unwritten scoped chapter, not the old checkpoint chapter", async (t) => {
  const originals = { chapter: prisma.chapter.findFirst, replan: prisma.replanRun.findFirst };
  t.after(() => { prisma.chapter.findFirst = originals.chapter; prisma.replanRun.findFirst = originals.replan; });
  let scheduled;
  const calls = [];
  prisma.chapter.findFirst = async (args) => { assert.deepEqual(args.where.order, { gte: 1, lte: 12 }); return { id: "chapter-6" }; };
  prisma.replanRun.findFirst = async (args) => { assert.equal(args.where.chapterId, "chapter-3"); return null; };
  const runtime = new NovelDirectorContinueRuntime({
    workflowService: {
      getTaskById: async () => ({ lane: "auto_director", status: "failed", novelId: "novel-1", checkpointType: "replan_required", currentItemKey: "quality_repair", resumeTargetJson: JSON.stringify({ chapterId: "chapter-3" }), seedPayloadJson: JSON.stringify({ directorInput: request, autoExecution: { enabled: true, mode: "book", startOrder: 1, endOrder: 12 } }) }),
      markTaskRunning: async (_id, input) => calls.push(["running", input]),
    },
    directorRuntime: { initializeRun: async () => {}, recordRunResumed: async () => {} },
    continueCandidateStageTask: async () => false,
    resolveAssetFirstRecovery: async () => ({ type: "auto_execution", resumeCheckpointType: "replan_required" }),
    replanNovel: async (_id, input) => calls.push(["replan", input]),
    autoExecutionRuntime: { runFromReady: async (input) => calls.push(["execute", input]) },
    scheduleBackgroundRun: (_id, run) => { scheduled = run; },
    buildDirectorSeedPayload: (_request, _novelId, extra) => extra,
  });
  await runtime.continueTask("t1", { forceResume: true });
  assert.equal(calls[0][1].seedPayload.resumeTarget.chapterId, "chapter-6");
  assert.equal(calls[0][1].clearCheckpoint, false);
  await scheduled();
  assert.equal(calls[1][1].chapterId, "chapter-6");
  assert.equal(calls[2][1].resumePendingManualRecovery, true);
});
