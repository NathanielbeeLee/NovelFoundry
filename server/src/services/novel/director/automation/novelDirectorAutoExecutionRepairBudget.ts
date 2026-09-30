import type { DirectorAutoExecutionState, DirectorConfirmRequest } from "@novelfoundry/shared/types/novelDirector";
import { parsePipelinePayload } from "../../pipelineJobState";
import { directorAutomationLedgerEventService } from "../runtime/DirectorAutomationLedgerEventService";
import { buildFailureCircuitBreaker, withCircuitBreakerState } from "./novelDirectorAutoExecutionCircuitBreakerRuntime";
import type { NovelDirectorAutoExecutionRuntimeDeps, PipelineJobSnapshot } from "./novelDirectorAutoExecutionRuntimePorts";
import {
  buildDirectorQualityLoopBudgetWindow, buildDirectorQualityLoopIssueSignature,
  findDirectorQualityLoopBudgetEntry, recordDirectorQualityLoopBudgetAttempt,
  resolveDirectorQualityLoopBudgetNextAction,
} from "../runtime/DirectorQualityLoopBudgetLedgerService";

/** Owns the chapter repair budget and audit event; global stop/continue remains with the orchestrator. */
export async function recordAutoExecutionFailureBudget(
  deps: NovelDirectorAutoExecutionRuntimeDeps,
  input: { taskId: string; novelId: string; request: DirectorConfirmRequest },
  autoExecution: DirectorAutoExecutionState,
  job: NonNullable<PipelineJobSnapshot>,
  pipelineJobId: string,
  failureMessage: string,
) {
  let budgetedAutoExecution = autoExecution;
  let qualityBudgetEntry: ReturnType<typeof recordDirectorQualityLoopBudgetAttempt>["entry"] | null = null;
  let qualityBudgetNextAction: ReturnType<typeof recordDirectorQualityLoopBudgetAttempt>["nextAction"] | null = null;
  if (job.status !== "cancelled" && autoExecution.autoRepair) {
    const pipelinePayload = parsePipelinePayload(job.payload);
    const affectedChapterWindow = buildDirectorQualityLoopBudgetWindow({
      autoExecution,
      chapterId: autoExecution.nextChapterId,
      chapterOrder: autoExecution.nextChapterOrder,
    });
    const issueSignature = buildDirectorQualityLoopIssueSignature({
      reason: failureMessage,
      noticeCode: job.noticeCode,
      repairMode: pipelinePayload.repairMode,
    });
    const existingBudgetEntry = findDirectorQualityLoopBudgetEntry({
      state: autoExecution,
      novelId: input.novelId,
      taskId: input.taskId,
      issueSignature,
      affectedChapterWindow,
    });
    const plannedBudgetAction = resolveDirectorQualityLoopBudgetNextAction(existingBudgetEntry);
    const budgetAttemptAction = plannedBudgetAction === "auto_rewrite_chapter"
      ? "chapter_rewrite"
      : plannedBudgetAction === "auto_replan_window"
        ? "window_replan"
        : plannedBudgetAction === "defer_and_continue"
          ? "defer_and_continue"
          : "patch_repair";
    const budgetResult = recordDirectorQualityLoopBudgetAttempt({
      state: autoExecution,
      novelId: input.novelId,
      taskId: input.taskId,
      issueSignature,
      affectedChapterWindow,
      action: budgetAttemptAction,
      reason: failureMessage,
      chapterId: autoExecution.nextChapterId,
      chapterOrder: autoExecution.nextChapterOrder,
    });
    budgetedAutoExecution = budgetResult.state;
    qualityBudgetEntry = budgetResult.entry;
    qualityBudgetNextAction = budgetResult.nextAction;
  }
  const failureCircuitBreaker = buildFailureCircuitBreaker({
    autoExecution: budgetedAutoExecution,
    jobStatus: job.status,
    message: failureMessage,
  });
  const failedAutoExecution = withCircuitBreakerState({
    ...budgetedAutoExecution,
    pipelineJobId,
    pipelineStatus: job.status,
  }, failureCircuitBreaker);
  if (autoExecution.autoRepair && job.status !== "cancelled") {
    const ledgerEventService = deps.automationLedgerEventService ?? directorAutomationLedgerEventService;
    await ledgerEventService.recordRepairTicketCreated({
      taskId: input.taskId,
      novelId: input.novelId,
      chapterId: autoExecution.nextChapterId ?? null,
      summary: failureMessage,
      failureCount: failureCircuitBreaker.patchFailureCount ?? failureCircuitBreaker.failureCount ?? 1,
      metadata: {
        pipelineJobId,
        pipelineStatus: job.status,
        chapterOrder: autoExecution.nextChapterOrder ?? null,
        qualityBudgetEntry,
        qualityBudgetNextAction,
      },
    }).catch(() => null);
  }
  return { qualityBudgetEntry, qualityBudgetNextAction, failureCircuitBreaker, failedAutoExecution };
}
