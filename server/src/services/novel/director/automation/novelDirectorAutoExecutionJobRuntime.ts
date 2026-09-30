import { buildDirectorAutoExecutionPausedLabel, buildDirectorAutoExecutionScopeLabelFromState } from "./novelDirectorAutoExecution";
import { syncAutoExecutionTaskState, type AutoExecutionCheckpointBaseInput } from "./novelDirectorAutoExecutionCheckpointRuntime";
import type { DirectorAutoExecutionChapterRef } from "./novelDirectorAutoExecution";
import type {
  NovelDirectorAutoExecutionRuntimeDeps,
  PipelineJobSnapshot,
} from "./novelDirectorAutoExecutionRuntimePorts";

export async function resolvePipelineJobForAutoExecution(
  deps: NovelDirectorAutoExecutionRuntimeDeps,
  jobId: string,
  options: { resumePendingManualRecovery?: boolean } = {},
): Promise<PipelineJobSnapshot> {
  let job = await deps.novelService.getPipelineJobById(jobId);
  if (!job?.pendingManualRecovery || !options.resumePendingManualRecovery) {
    return job;
  }
  await deps.novelService.resumePipelineJob(job.id);
  job = await deps.novelService.getPipelineJobById(job.id);
  return job;
}

export async function resolveAutoExecutionQualityIssueChapter(
  deps: NovelDirectorAutoExecutionRuntimeDeps,
  novelId: string,
  job: NonNullable<PipelineJobSnapshot>,
): Promise<DirectorAutoExecutionChapterRef | null> {
  const startOrder = typeof job.startOrder === "number" && Number.isFinite(job.startOrder)
    ? job.startOrder
    : null;
  const endOrder = typeof job.endOrder === "number" && Number.isFinite(job.endOrder)
    ? job.endOrder
    : null;
  if (startOrder == null || (endOrder != null && endOrder !== startOrder)) {
    return null;
  }
  const chapters = await deps.novelContextService.listChapters(novelId);
  return chapters.find((chapter) => chapter.order === startOrder) ?? null;
}

export function schedulePendingReviewAutoPromotionIfEnabled(
  deps: Pick<
    NovelDirectorAutoExecutionRuntimeDeps,
    "isPendingReviewAutoPromotionEnabled" | "autoPromotePendingReviewProposals"
  >,
  input: {
    novelId: string;
    taskId: string;
  },
): void {
  if (!deps.isPendingReviewAutoPromotionEnabled || !deps.autoPromotePendingReviewProposals) {
    return;
  }
  void Promise.resolve(deps.isPendingReviewAutoPromotionEnabled())
    .then((enabled) => {
      if (!enabled) {
        return undefined;
      }
      return deps.autoPromotePendingReviewProposals?.(input);
    })
    .catch(() => null);
}

/** Preserve a pipeline's explicit manual pause without automatically restarting it during polling. */
export async function pauseAutoExecutionForManualRecovery(
  deps: NovelDirectorAutoExecutionRuntimeDeps,
  input: AutoExecutionCheckpointBaseInput & { job: NonNullable<PipelineJobSnapshot> },
): Promise<void> {
  const failureMessage = input.job.error?.trim() || "章节批次已暂停，确认后继续。";
  await deps.workflowService.requeueTaskForRecovery(input.taskId, failureMessage, {
    stage: "quality_repair",
    itemKey: "quality_repair",
    itemLabel: buildDirectorAutoExecutionPausedLabel(input.autoExecution),
    checkpointType: "chapter_batch_ready",
    checkpointSummary: failureMessage,
    chapterId: input.autoExecution.nextChapterId ?? input.range.firstChapterId,
    progress: input.job.progress,
  });
  await syncAutoExecutionTaskState(deps, { ...input, autoExecution: { ...input.autoExecution, pipelineStatus: input.job.status }, isBackgroundRunning: false, resumeStage: "pipeline" });
}

/** A saved final chapter is not proof that its pipeline's post-write work succeeded. */
export async function pauseAutoExecutionForTerminalJobFailure(
  deps: NovelDirectorAutoExecutionRuntimeDeps,
  input: AutoExecutionCheckpointBaseInput & { job: NonNullable<PipelineJobSnapshot> },
): Promise<void> {
  const scopeLabel = buildDirectorAutoExecutionScopeLabelFromState(input.autoExecution, input.range.totalChapterCount);
  const failureMessage = input.job.error?.trim()
    || (input.job.status === "cancelled"
      ? `${scopeLabel}自动执行已取消。`
      : `${scopeLabel}自动执行未完成，请检查并恢复章节任务。`);
  const failedState = {
    ...input.autoExecution,
    pipelineJobId: input.job.id,
    pipelineStatus: input.job.status,
  };
  await deps.workflowService.markTaskFailed(input.taskId, failureMessage, {
    stage: "quality_repair",
    itemKey: "quality_repair",
    itemLabel: buildDirectorAutoExecutionPausedLabel(failedState),
    checkpointType: "chapter_batch_ready",
    checkpointSummary: failureMessage,
    chapterId: input.range.firstChapterId,
    progress: 0.98,
  });
  await syncAutoExecutionTaskState(deps, {
    ...input,
    autoExecution: failedState,
    isBackgroundRunning: false,
    resumeStage: "pipeline",
  });
}
