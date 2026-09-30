import type { DirectorBookTokenBudgetSummary } from "@novelfoundry/shared/types/directorRuntime";
import type {
  DirectorAutoExecutionState,
  DirectorConfirmRequest,
} from "@novelfoundry/shared/types/novelDirector";
import { buildNovelEditResumeTarget } from "../../workflow/novelWorkflow.shared";
import { directorBookTokenBudgetService } from "../runtime/usage";
import { buildDirectorSessionState } from "../runtime/novelDirectorHelpers";
import {
  buildDirectorAutoExecutionScopeLabelFromState,
  type DirectorAutoExecutionRange,
} from "./novelDirectorAutoExecution";
import type {
  AutoExecutionCheckpointRuntimeDeps,
  AutoExecutionResumeStage,
} from "./novelDirectorAutoExecutionCheckpointRuntime";

type TokenBudgetServicePort = Pick<
  typeof directorBookTokenBudgetService,
  "evaluateBoundary"
>;

export interface AutoExecutionTokenBudgetRuntimeDeps extends AutoExecutionCheckpointRuntimeDeps {
  tokenBudgetService?: TokenBudgetServicePort;
}

function formatTokens(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function buildBudgetCheckpointSummary(
  budget: DirectorBookTokenBudgetSummary,
  autoExecution: DirectorAutoExecutionState,
  range: DirectorAutoExecutionRange,
): string {
  const scopeLabel = buildDirectorAutoExecutionScopeLabelFromState(autoExecution, range.totalChapterCount);
  const nextChapter = typeof autoExecution.nextChapterOrder === "number"
    ? `第 ${autoExecution.nextChapterOrder} 章开始前`
    : "下一项自动任务开始前";
  return `${scopeLabel}已在${nextChapter}暂停：本书自动导演累计使用 ${formatTokens(budget.usedTokens)} Tokens，达到 ${formatTokens(budget.limitTokens ?? 0)} Tokens 预算。已完成的正文和状态会保留；上调或关闭预算后可以继续剩余范围。`;
}

export async function stopAutoExecutionAtTokenBudgetBoundary(
  deps: AutoExecutionTokenBudgetRuntimeDeps,
  input: {
    taskId: string;
    novelId: string;
    request: DirectorConfirmRequest;
    range: DirectorAutoExecutionRange;
    autoExecution: DirectorAutoExecutionState;
    resumeStage?: AutoExecutionResumeStage;
  },
): Promise<boolean> {
  const hasRemainingWork = (input.autoExecution.remainingChapterCount ?? 0) > 0
    || Boolean(input.autoExecution.nextChapterId)
    || (input.autoExecution.remainingChapterIds?.length ?? 0) > 0;
  if (!hasRemainingWork) {
    return false;
  }
  const service = deps.tokenBudgetService ?? directorBookTokenBudgetService;
  const budget = await service.evaluateBoundary({
    novelId: input.novelId,
    taskId: input.taskId,
  });
  if (budget.status !== "exhausted") {
    return false;
  }
  const chapterId = input.autoExecution.nextChapterId ?? input.range.firstChapterId;
  await deps.workflowService.recordCheckpoint(input.taskId, {
    stage: "chapter_execution",
    checkpointType: "chapter_batch_ready",
    checkpointSummary: buildBudgetCheckpointSummary(budget, input.autoExecution, input.range),
    itemLabel: "Token 预算已用尽，等待调整",
    chapterId,
    progress: 0.93,
    seedPayload: deps.buildDirectorSeedPayload(input.request, input.novelId, {
      directorSession: buildDirectorSessionState({
        runMode: input.request.runMode,
        phase: "chapter_execution",
        isBackgroundRunning: false,
      }),
      resumeTarget: buildNovelEditResumeTarget({
        novelId: input.novelId,
        taskId: input.taskId,
        stage: input.resumeStage ?? "pipeline",
        chapterId,
      }),
      autoExecution: input.autoExecution,
    }),
  });
  return true;
}
