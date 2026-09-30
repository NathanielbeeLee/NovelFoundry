import type { DirectorAutoExecutionState, DirectorConfirmRequest } from "@novelfoundry/shared/types/novelDirector";
import { isDirectorAutoExecutionRunMode } from "@novelfoundry/shared/types/novelDirector";
import { hasDirectorSyncedChapterExecutionContext } from "../../../automation/novelDirectorAutoExecution";
import { createWorkflowStepModule, getWorkflowStepDirectorTaskId, getWorkflowStepInput, getWorkflowStepTargetChapterId, type WorkflowStepModule, type WorkflowStepModuleDescriptor } from "../../WorkflowStepModule";
import { blockedState, buildSimpleProgress, completedFact, getDirectorCoreStateReader, getDirectorCoreStateCommitter, getDirectorCoreStepRuntime, loadDirectorModuleState, pendingFact, readyState, requireDirectorRequest, resolveChapterExecutionProgressScope, scopeChapterExecutionProgress } from "../../directorWorkflowStepShared";
import type { ChapterRuntimeRequestInput } from "../../../../runtime/chapterRuntimeSchema";
import type { DirectorCoreStepModuleRuntime } from "../../DirectorCoreStepModuleRuntime";

type ChapterDraftStepInput =
  | {
    mode: "auto_director";
    taskId: string;
    novelId: string;
    request: DirectorConfirmRequest;
    existingPipelineJobId?: string | null;
    existingState?: DirectorAutoExecutionState | null;
    resumeCheckpointType?: "chapter_batch_ready" | "replan_required" | null;
    previousFailureMessage?: string | null;
    allowSkipReviewBlockedChapter?: boolean;
    resumePendingManualRecovery?: boolean;
  }
  | {
    mode: "manual";
    novelId: string;
    chapterId: string;
    options?: ChapterRuntimeRequestInput;
    useRuntimeStream?: boolean;
  };

type ChapterDraftStepOutput =
  | Awaited<ReturnType<DirectorCoreStepModuleRuntime["executeChapterDraftStep"]>>
  | Awaited<ReturnType<DirectorCoreStepModuleRuntime["executeManualChapterDraftStep"]>>;

interface ManualChapterDraftStepPayload {
  options?: ChapterRuntimeRequestInput;
  runtimeStream?: boolean;
}

function resolveManualChapterDraftPayload(value: unknown): ManualChapterDraftStepPayload {
  if (value && typeof value === "object" && ("options" in value || "runtimeStream" in value)) {
    const payload = value as ManualChapterDraftStepPayload;
    return {
      options: payload.options ?? {},
      runtimeStream: payload.runtimeStream === true,
    };
  }
  return {
    options: value as ChapterRuntimeRequestInput | undefined,
    runtimeStream: false,
  };
}

export function createChapterDraftExecutableModule(
  descriptor: WorkflowStepModuleDescriptor,
): WorkflowStepModule<ChapterDraftStepInput, ChapterDraftStepOutput> {
  async function inspectFreshScopedProgress(input: {
    novelId: string;
    state: Awaited<ReturnType<typeof loadDirectorModuleState>>["state"];
    request: DirectorConfirmRequest | null;
  }) {
    const progress = await getDirectorCoreStepRuntime().inspectChapterExecutionProgress(input.novelId);
    return scopeChapterExecutionProgress(
      progress,
      resolveChapterExecutionProgressScope({ state: input.state, request: input.request }),
    );
  }

  return createWorkflowStepModule(
    descriptor,
    async (input) => {
      if (input.mode === "manual") {
        return getDirectorCoreStepRuntime().executeManualChapterDraftStep(input);
      }
      return getDirectorCoreStepRuntime().executeChapterDraftStep(input);
    },
    {
      inspectReadiness: async (context) => {
        const { state, novelId } = await loadDirectorModuleState(context);
        const targetChapterId = getWorkflowStepTargetChapterId(context);
        if (context.mode === "manual" && targetChapterId) {
          return readyState({
            evidence: {
              targetChapterId,
              mode: "manual",
            },
          });
        }
        const chapterProgress = await getDirectorCoreStepRuntime().inspectChapterExecutionProgress(novelId);
        const executionChapters = await getDirectorCoreStepRuntime().getExecutionChapters(novelId);
        const syncedChapterCount = executionChapters.filter((chapter) => hasDirectorSyncedChapterExecutionContext(chapter)).length;
        if (syncedChapterCount === 0) {
          return blockedState("Formal chapters with synced execution context are required before chapter execution.", {
            code: "missing_execution_contract_sync",
            evidence: { chapterCount: executionChapters.length, syncedChapterCount },
            nextAction: "sync_execution_contracts",
          });
        }
        return readyState({
          evidence: {
            syncedChapterCount,
            draftedChapterCount: chapterProgress?.draftedChapterCount ?? 0,
            completedChapters: chapterProgress?.completedChapters ?? 0,
          },
        });
      },
      inspectCompletion: async (context) => {
        const { state, novelId, request } = await loadDirectorModuleState(context);
        const chapterProgress = await inspectFreshScopedProgress({ novelId, state, request });
        const draftedChapterCount = chapterProgress?.draftedChapterCount ?? 0;
        const totalChapters = chapterProgress?.totalChapters ?? 0;
        return totalChapters > 0 && draftedChapterCount >= totalChapters
          ? completedFact(descriptor.id, {
            evidence: {
              draftedChapterCount,
              approvedChapterCount: chapterProgress?.approvedChapterCount ?? 0,
              completedChapters: chapterProgress?.completedChapters ?? 0,
              totalChapters,
            },
          })
          : pendingFact(descriptor.id, {
            ratio: totalChapters > 0 ? Math.min(1, draftedChapterCount / totalChapters) : 0,
            evidence: {
              draftedChapterCount,
              approvedChapterCount: chapterProgress?.approvedChapterCount ?? 0,
              completedChapters: chapterProgress?.completedChapters ?? 0,
              needsRepairChapters: chapterProgress?.needsRepairChapters ?? 0,
              totalChapters,
            },
          });
      },
      buildInput: async (context) => {
        const { state, novelId, request } = await loadDirectorModuleState(context);
        const targetChapterId = getWorkflowStepTargetChapterId(context);
        if (context.mode === "manual" && targetChapterId) {
          const payload = resolveManualChapterDraftPayload(getWorkflowStepInput(context));
          return {
            mode: "manual",
            novelId,
            chapterId: targetChapterId,
            options: payload.options,
            useRuntimeStream: payload.runtimeStream,
          };
        }
        const directorRequest = requireDirectorRequest(request);
        const requestedAutoExecutionContinue = state.task.status === "failed" || state.task.status === "cancelled";
        return {
          mode: "auto_director",
          taskId: state.task.id,
          novelId,
          request: directorRequest,
          existingPipelineJobId: state.seedPayload.autoExecution?.pipelineJobId ?? null,
          existingState: state.seedPayload.autoExecution ?? null,
          resumeCheckpointType: (
            state.task.checkpointType === "chapter_batch_ready"
            || state.task.checkpointType === "replan_required"
          )
            ? state.task.checkpointType
            : "chapter_batch_ready",
          previousFailureMessage: state.task.lastError ?? null,
          allowSkipReviewBlockedChapter: requestedAutoExecutionContinue && isDirectorAutoExecutionRunMode(directorRequest.runMode),
          resumePendingManualRecovery: requestedAutoExecutionContinue,
        };
      },
      validateOutput: async (_output, context) => {
        if (context.mode === "manual") {
          return { valid: true };
        }
        const { state, novelId, request } = await loadDirectorModuleState(context);
        const directorTaskId = getWorkflowStepDirectorTaskId(context);
        const freshState = directorTaskId
          ? await getDirectorCoreStateReader().readByTaskId(directorTaskId).catch(() => null)
          : null;
        const observedState = freshState ?? state;
        const progress = await inspectFreshScopedProgress({ novelId, state: observedState, request });
        if (observedState.task.pendingManualRecovery) {
          return {
            valid: true,
            evidence: {
              pendingManualRecovery: true,
              draftedChapterCount: progress?.draftedChapterCount ?? 0,
              totalChapters: progress?.totalChapters ?? 0,
              lastError: observedState.task.lastError ?? null,
            },
          };
        }
        const hasObservedDraft = Boolean(
          progress
          && progress.totalChapters > 0
          && progress.draftedChapterCount > 0,
        );
        const hasCompletedDraftScope = Boolean(
          progress
          && progress.totalChapters > 0
          && progress.draftedChapterCount >= progress.totalChapters,
        );
        if (!hasObservedDraft) {
          // The scoped chapters have no saved draft content. The "no draft"
          // condition itself is accurate (drafts are persisted synchronously and
          // the execution loop is awaited before this check), but on its own the
          // generic message hides *why* nothing was drafted — the run may have
          // paused for replan/approval, been halted by a usage circuit breaker or
          // stop signal, or the writer/provider may have raised an error recorded
          // on the task. Surface that specific reason so the failure is actionable
          // instead of letting this branch preempt the more precise checks below.
          const stopDetail = observedState.task.lastError?.trim()
            || observedState.task.checkpointSummary?.trim()
            || null;
          return {
            valid: false,
            reason: stopDetail
              ? `Chapter execution did not produce observable draft content（实际中断原因：${stopDetail}）。`
              : "Chapter execution did not produce observable draft content.",
            evidence: {
              draftedChapterCount: progress?.draftedChapterCount ?? 0,
              totalChapters: progress?.totalChapters ?? 0,
              taskStatus: observedState.task.status,
              checkpointType: observedState.task.checkpointType ?? null,
              lastError: observedState.task.lastError ?? null,
            },
          };
        }
        if (observedState.task.status === "waiting_approval" && observedState.task.checkpointType === "replan_required") {
          return {
            valid: false,
            reason: observedState.task.checkpointSummary?.trim()
              || observedState.task.lastError?.trim()
              || "章节正文已生成，但本章职责与后续计划失配，需要先处理质量修复 / 重规划。",
          };
        }
        if ((observedState.task.status === "failed" || observedState.task.status === "cancelled") && !hasCompletedDraftScope) {
          const reason = observedState.task.lastError?.trim()
            || observedState.task.checkpointSummary?.trim()
            || "Chapter execution stopped before completing the draft step.";
          return {
            valid: false,
            reason,
          };
        }
        return {
          valid: true,
          evidence: {
            draftedChapterCount: progress?.draftedChapterCount ?? 0,
            totalChapters: progress?.totalChapters ?? 0,
          },
        };
      },
      commit: async (_output, context) => {
        if (context.mode === "manual") {
          return { producedArtifacts: [] };
        }
        const { state, novelId } = await loadDirectorModuleState(context);
        const producedArtifacts = await getDirectorCoreStepRuntime().collectWrittenArtifacts(
          novelId,
          state.task.id,
          descriptor.writes,
        );
        await getDirectorCoreStateCommitter().recordArtifactsIndexed({
          taskId: state.task.id,
          novelId,
          runtimeId: state.runtime?.id ?? null,
          nodeKey: descriptor.nodeKey,
          artifacts: producedArtifacts,
        });
        return { producedArtifacts };
      },
      inspectProgress: async (context) => {
        const { state, novelId, request } = await loadDirectorModuleState(context);
        const progress = await inspectFreshScopedProgress({ novelId, state, request });
        if (!progress || progress.totalChapters === 0) {
          return buildSimpleProgress({
            status: "not_started",
            ratio: 0,
            label: "\u7b49\u5f85\u8fdb\u5165\u7ae0\u8282\u6267\u884c",
            nextAction: "run_chapter_execution",
          });
        }
        const draftedRatio = progress.totalChapters > 0
          ? Math.min(1, progress.draftedChapterCount / progress.totalChapters)
          : 0;
        if (progress.totalChapters > 0 && progress.draftedChapterCount >= progress.totalChapters) {
          return buildSimpleProgress({
            status: "completed",
            ratio: 1,
            label: "\u6b63\u6587\u5df2\u5168\u90e8\u751f\u6210",
            evidence: {
              draftedChapterCount: progress.draftedChapterCount,
              approvedChapterCount: progress.approvedChapterCount,
              completedChapters: progress.completedChapters,
              totalChapters: progress.totalChapters,
              needsRepairChapters: progress.needsRepairChapters,
            },
            nextAction: progress.needsRepairChapters > 0 ? "repair_chapter" : "run_quality_review",
          });
        }
        return buildSimpleProgress({
          status: "partially_done",
          ratio: draftedRatio,
          label: progress.activeChapterOrder
            ? `\u6b63\u5728\u63a8\u8fdb\u7b2c ${progress.activeChapterOrder} \u7ae0`
            : progress.currentChapterOrder
              ? `\u5f53\u524d\u53ef\u4ece\u7b2c ${progress.currentChapterOrder} \u7ae0\u7ee7\u7eed\u8865\u9f50`
              : "\u6b63\u5728\u63a8\u8fdb\u7ae0\u8282\u6267\u884c",
          evidence: {
            activeChapterOrder: progress.activeChapterOrder,
            currentChapterOrder: progress.currentChapterOrder,
            draftedChapterCount: progress.draftedChapterCount,
            approvedChapterCount: progress.approvedChapterCount,
            completedChapters: progress.completedChapters,
            needsRepairChapters: progress.needsRepairChapters,
            totalChapters: progress.totalChapters,
          },
          nextAction: "continue_chapter_execution",
        });
      },
        recover: async (context) => {
          const { novelId, state, request } = await loadDirectorModuleState(context);
          const progress = await inspectFreshScopedProgress({ novelId, state, request });
          const resumeChapterOrder = progress?.activeChapterOrder ?? progress?.currentChapterOrder;
          const resumeFrom = resumeChapterOrder
            ? `chapter:${resumeChapterOrder}`
            : "chapter_execution";
          return {
            recoverable: Boolean(progress?.recoverableRange),
            resumeFrom,
            reason: progress?.recoverableRange
              ? "Chapter execution can resume from the latest observable progress."
            : "Chapter execution requires a new start point.",
        };
      },
      completeCriteria: async (_output, context) => {
        const { state, novelId, request } = await loadDirectorModuleState(context);
        const progress = await inspectFreshScopedProgress({ novelId, state, request });
        return Boolean(
          progress
          && progress.totalChapters > 0
          && progress.draftedChapterCount >= progress.totalChapters,
        );
      },
      acceptablePauseCriteria: async (_output, context) => {
        const directorTaskId = getWorkflowStepDirectorTaskId(context);
        const freshState = directorTaskId
          ? await getDirectorCoreStateReader().readByTaskId(directorTaskId).catch(() => null)
          : null;
        const { state } = freshState
          ? { state: freshState }
          : await loadDirectorModuleState(context);
        return state.task.pendingManualRecovery === true;
      },
    },
  );
}
