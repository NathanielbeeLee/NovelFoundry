import { getDirectorExecutionNodeAdapter, type DirectorExecutionStage } from "../../../phases/novelDirectorExecutionNodeAdapters";
import { createWorkflowStepDescriptorFromDirectorAdapter, createWorkflowStepModule, getWorkflowStepDirectorTaskId, getWorkflowStepInput, getWorkflowStepTargetChapterId, type WorkflowStepExecutionContext, type WorkflowStepModule, type WorkflowStepModuleDescriptor, type WorkflowStepProgress } from "../../WorkflowStepModule";
import { blockedState, buildSimpleProgress, completedFact, getActiveArtifactsFromContext, getDirectorCoreStateCommitter, getDirectorCoreStepRuntime, loadDirectorModuleState, pendingFact, readyState, resolveChapterExecutionProgressScope, scopeChapterExecutionProgress } from "../../directorWorkflowStepShared";
import { DIRECTOR_EXECUTION_STEP_IDS } from "../../directorWorkflowStepIds";
import type { RepairOptions } from "../../../../novelCoreShared";

async function inspectScopedChapterExecutionProgress(context: WorkflowStepExecutionContext) {
  const { state, novelId, request } = await loadDirectorModuleState(context);
  const progress = await getDirectorCoreStepRuntime().inspectChapterExecutionProgress(novelId);
  return scopeChapterExecutionProgress(
    progress,
    resolveChapterExecutionProgressScope({ state, request }),
  );
}

async function inspectScopedChapterStateCommitFacts(context: WorkflowStepExecutionContext) {
  const progress = await inspectScopedChapterExecutionProgress(context);
  const draftedChapterCount = progress?.draftedChapterCount ?? 0;
  const committedChapterCount = progress?.chapters?.filter((chapter) => (
    chapter.completedStages.includes("chapter_state_committed")
  )).length ?? 0;
  const totalChapters = progress?.totalChapters ?? 0;
  return {
    draftedChapterCount,
    committedChapterCount,
    totalChapters,
  };
}

async function collectRuntimeArtifactsForTypes(context: WorkflowStepExecutionContext, types: string[]) {
  const { state, novelId } = await loadDirectorModuleState(context);
  const artifacts = await getDirectorCoreStepRuntime().collectWrittenArtifacts(novelId, state.task.id, types);
  return { state, novelId, artifacts };
}

function createFactOnlyExecutionModule(input: {
  descriptor: WorkflowStepModuleDescriptor;
  executeManual?: (context: WorkflowStepExecutionContext, novelId: string) => Promise<unknown>;
  inspectFacts: (context: WorkflowStepExecutionContext) => Promise<{
    readiness: ReturnType<typeof readyState> | ReturnType<typeof blockedState>;
    completion: ReturnType<typeof completedFact> | ReturnType<typeof pendingFact>;
    progress: WorkflowStepProgress;
  }>;
}): WorkflowStepModule<{ taskId: string; novelId: string }, unknown> {
  return createWorkflowStepModule(
    input.descriptor,
    async (moduleInput, context): Promise<unknown> => {
      if (context.mode === "manual" && input.executeManual) {
        return input.executeManual(context, moduleInput.novelId);
      }
      return undefined;
    },
    {
      inspectReadiness: async (context) => {
        const targetChapterId = getWorkflowStepTargetChapterId(context);
        if (context.mode === "manual" && input.executeManual && targetChapterId) {
          return readyState({ evidence: { targetChapterId, mode: "manual" } });
        }
        return (await input.inspectFacts(context)).readiness;
      },
      inspectCompletion: async (context) => (await input.inspectFacts(context)).completion,
      buildInput: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        return {
          taskId: getWorkflowStepDirectorTaskId(context) ?? "",
          novelId,
        };
      },
      validateOutput: async (_output, context) => {
        if (context.mode === "manual" && input.executeManual) {
          return { valid: true };
        }
        const facts = await input.inspectFacts(context);
        return {
          valid: facts.completion.completed,
          reason: facts.completion.completed ? undefined : `${input.descriptor.id} facts are not complete yet.`,
          evidence: facts.completion.evidence,
        };
      },
      commit: async (_output, context) => {
        if (context.mode === "manual" && input.executeManual) {
          return { producedArtifacts: [] };
        }
        const { state, novelId, artifacts } = await collectRuntimeArtifactsForTypes(context, input.descriptor.writes);
        await getDirectorCoreStateCommitter().recordArtifactsIndexed({
          taskId: state.task.id,
          novelId,
          runtimeId: state.runtime?.id ?? null,
          nodeKey: input.descriptor.nodeKey,
          artifacts,
        });
        return { producedArtifacts: artifacts };
      },
      inspectProgress: async (context) => (await input.inspectFacts(context)).progress,
        recover: async (context) => {
          const { state, novelId } = await loadDirectorModuleState(context);
          return {
            recoverable: true,
            resumeFrom: input.descriptor.id,
            reason: `${input.descriptor.label} can resume from observable execution artifacts.`,
          };
      },
      completeCriteria: async (_output, context) => (await input.inspectFacts(context)).completion.completed,
    },
  );
}

function chapterHasCompletedStage(
  chapter: { completedStages?: string[] | null },
  stage: string,
): boolean {
  return Array.isArray(chapter.completedStages) && chapter.completedStages.includes(stage);
}

async function isAutoQualityReviewDisabled(context: WorkflowStepExecutionContext): Promise<boolean> {
  const { state, request } = await loadDirectorModuleState(context, { requireNovel: false });
  const seedPayload = state.seedPayload as {
    autoExecution?: { autoReview?: unknown } | null;
    autoExecutionPlan?: { autoReview?: unknown } | null;
  };
  return seedPayload.autoExecution?.autoReview === false
    || seedPayload.autoExecutionPlan?.autoReview === false
    || request?.autoExecutionPlan?.autoReview === false;
}

export const CHAPTER_QUALITY_STEP_MODULES: Record<Exclude<DirectorExecutionStage, "chapter_execution">, WorkflowStepModuleDescriptor> = {
chapter_quality_review: createFactOnlyExecutionModule({
    descriptor: createWorkflowStepDescriptorFromDirectorAdapter({
      id: DIRECTOR_EXECUTION_STEP_IDS.chapter_quality_review,
      stage: "quality_repair",
      adapter: getDirectorExecutionNodeAdapter("chapter_quality_review"),
      promptAssets: [{ id: "audit.chapter.full", version: "v2" }],
    }),
    inspectFacts: async (context) => {
      const progress = await inspectScopedChapterExecutionProgress(context);
      const autoReviewDisabled = await isAutoQualityReviewDisabled(context);
      const draftedCount = progress?.draftedChapterCount ?? 0;
      const reviewedCount = progress?.chapters?.filter((chapter) => chapterHasCompletedStage(chapter, "audit_completed")).length ?? 0;
      const reviewed = reviewedCount;
      const evidence = {
        draftedChapterCount: draftedCount,
        reviewedChapterCount: reviewedCount,
        autoReview: autoReviewDisabled ? false : true,
        reviewSkipped: autoReviewDisabled,
      };
      const completed = draftedCount > 0 && (autoReviewDisabled || reviewedCount >= draftedCount);
      return {
        readiness: draftedCount > 0
          ? readyState({ evidence })
          : blockedState("Draft chapters are required before quality review.", {
            code: "missing_chapter_drafts",
            nextAction: "continue_chapter_execution",
          }),
        completion: completed
          ? completedFact(DIRECTOR_EXECUTION_STEP_IDS.chapter_quality_review, { evidence })
          : pendingFact(DIRECTOR_EXECUTION_STEP_IDS.chapter_quality_review, {
            ratio: draftedCount > 0 ? reviewedCount / draftedCount : 0,
            evidence,
          }),
        progress: buildSimpleProgress({
          status: completed ? "completed" : draftedCount > 0 ? "partially_done" : "blocked",
          ratio: completed ? 1 : draftedCount > 0 ? reviewed / draftedCount : 0,
          label: completed
            ? (autoReviewDisabled ? "本轮不执行自动审校" : "章节审校已完成")
            : "正在根据最新正文补齐审校结果",
          evidence: { draftedChapterCount: draftedCount, reviewedChapterCount: reviewed, autoReview: !autoReviewDisabled, reviewSkipped: autoReviewDisabled },
          nextAction: completed ? "commit_chapter_state" : "run_quality_review",
        }),
      };
    },
  }),
chapter_repair: createFactOnlyExecutionModule({
    descriptor: createWorkflowStepDescriptorFromDirectorAdapter({
      id: DIRECTOR_EXECUTION_STEP_IDS.chapter_repair,
      stage: "quality_repair",
      adapter: getDirectorExecutionNodeAdapter("chapter_repair"),
    }),
    executeManual: async (context, novelId) => {
      const chapterId = getWorkflowStepTargetChapterId(context);
      if (!chapterId) {
        throw new Error("Manual chapter repair requires targetChapterId.");
      }
      return getDirectorCoreStepRuntime().executeManualChapterRepairStep({
        novelId,
        chapterId,
        options: getWorkflowStepInput<RepairOptions>(context),
      });
    },
    inspectFacts: async (context) => {
      const progressSummary = await inspectScopedChapterExecutionProgress(context);
      const draftedChapterCount = progressSummary?.draftedChapterCount ?? 0;
      const reviewedChapterCount = progressSummary?.chapters?.filter((chapter) => chapterHasCompletedStage(chapter, "audit_completed")).length ?? 0;
      const needsRepairChapters = progressSummary?.needsRepairChapters ?? 0;
      const hasRepairContext = reviewedChapterCount > 0 || needsRepairChapters > 0;
      const progress = {
        needsRepairChapters: hasRepairContext ? needsRepairChapters : 1,
        totalChapters: Math.max(draftedChapterCount, 1),
      };
      return {
        readiness: draftedChapterCount === 0
          ? blockedState("Draft chapters are required before chapter repair.", {
            code: "missing_chapter_drafts",
            nextAction: "continue_chapter_execution",
          })
          : hasRepairContext
            ? readyState({ evidence: { draftedChapterCount, reviewedChapterCount, needsRepairChapters } })
            : blockedState("Quality review facts must exist before chapter repair.", {
              code: "missing_quality_review_facts",
              evidence: { draftedChapterCount, reviewedChapterCount, needsRepairChapters },
              nextAction: "run_quality_review",
            }),
        completion: hasRepairContext && needsRepairChapters === 0
          ? completedFact(DIRECTOR_EXECUTION_STEP_IDS.chapter_repair, { evidence: { draftedChapterCount, reviewedChapterCount, needsRepairChapters: 0 } })
          : pendingFact(DIRECTOR_EXECUTION_STEP_IDS.chapter_repair, {
            ratio: hasRepairContext ? Math.max(0, 1 - (needsRepairChapters / Math.max(draftedChapterCount, 1))) : 0,
            evidence: { draftedChapterCount, reviewedChapterCount, needsRepairChapters, totalChapters: draftedChapterCount },
          }),
        progress: buildSimpleProgress({
          status: draftedChapterCount === 0 ? "blocked" : hasRepairContext ? ((progress?.needsRepairChapters ?? 0) === 0 ? "completed" : "needs_review") : "not_started",
          ratio: hasRepairContext ? Math.max(0, 1 - (needsRepairChapters / Math.max(draftedChapterCount, 1))) : 0,
          label: (progress?.needsRepairChapters ?? 0) === 0 ? "章节修复已收敛" : "仍有章节处于待修复状态",
          evidence: { draftedChapterCount, reviewedChapterCount, needsRepairChapters },
          nextAction: draftedChapterCount === 0 ? "continue_chapter_execution" : hasRepairContext ? ((progress?.needsRepairChapters ?? 0) === 0 ? "run_quality_review" : "repair_chapter") : "run_quality_review",
        }),
      };
    },
  }),
chapter_state_commit: createFactOnlyExecutionModule({
    descriptor: createWorkflowStepDescriptorFromDirectorAdapter({
      id: DIRECTOR_EXECUTION_STEP_IDS.chapter_state_commit,
      stage: "quality_repair",
      adapter: getDirectorExecutionNodeAdapter("chapter_state_commit"),
    }),
    inspectFacts: async (context) => {
      const {
        draftedChapterCount,
        committedChapterCount,
        totalChapters,
      } = await inspectScopedChapterStateCommitFacts(context);
      const evidence = {
        draftedChapterCount,
        committedChapterCount,
        totalChapters,
      };
      const completed = draftedChapterCount > 0 && committedChapterCount >= draftedChapterCount;
      return {
        readiness: draftedChapterCount > 0
          ? readyState({ evidence })
          : blockedState("Chapter state commit requires drafted chapters.", { code: "missing_chapter_drafts", nextAction: "continue_chapter_execution" }),
        completion: completed
          ? completedFact(DIRECTOR_EXECUTION_STEP_IDS.chapter_state_commit, { evidence })
          : pendingFact(DIRECTOR_EXECUTION_STEP_IDS.chapter_state_commit, {
            ratio: draftedChapterCount > 0 ? committedChapterCount / draftedChapterCount : 0,
            evidence,
          }),
        progress: buildSimpleProgress({
          status: completed ? "completed" : draftedChapterCount > 0 ? "partially_done" : "blocked",
          ratio: draftedChapterCount > 0 ? committedChapterCount / draftedChapterCount : 0,
          label: completed ? "章节状态提交已完成" : "正在补齐章节状态提交",
          evidence,
          nextAction: completed ? "sync_payoff_ledger" : "commit_state",
        }),
      };
    },
  }),
payoff_ledger_sync: createFactOnlyExecutionModule({
    descriptor: createWorkflowStepDescriptorFromDirectorAdapter({
      id: DIRECTOR_EXECUTION_STEP_IDS.payoff_ledger_sync,
      stage: "quality_repair",
      adapter: getDirectorExecutionNodeAdapter("payoff_ledger_sync"),
      promptAssets: [{ id: "novel.payoff_ledger.sync", version: "v5" }],
    }),
    inspectFacts: async (context) => {
      const activeArtifacts = getActiveArtifactsFromContext(context, ["reader_promise", "repair_ticket"]);
      return {
        readiness: readyState({ evidence: { artifactCount: activeArtifacts.length } }),
        completion: activeArtifacts.length > 0
          ? completedFact(DIRECTOR_EXECUTION_STEP_IDS.payoff_ledger_sync, { evidence: { artifactCount: activeArtifacts.length }, producedArtifacts: activeArtifacts })
          : pendingFact(DIRECTOR_EXECUTION_STEP_IDS.payoff_ledger_sync, { evidence: { artifactCount: 0 } }),
        progress: buildSimpleProgress({
          status: activeArtifacts.length > 0 ? "completed" : "partially_done",
          ratio: activeArtifacts.length > 0 ? 1 : 0,
          label: activeArtifacts.length > 0 ? "伏笔账本与读者承诺已同步" : "等待同步伏笔账本与读者承诺",
          evidence: { artifactCount: activeArtifacts.length },
          nextAction: activeArtifacts.length > 0 ? "sync_character_resources" : "sync_payoff_ledger",
        }),
      };
    },
  }),
character_resource_sync: createFactOnlyExecutionModule({
    descriptor: createWorkflowStepDescriptorFromDirectorAdapter({
      id: DIRECTOR_EXECUTION_STEP_IDS.character_resource_sync,
      stage: "quality_repair",
      adapter: getDirectorExecutionNodeAdapter("character_resource_sync"),
    }),
    inspectFacts: async (context) => {
      const activeArtifacts = getActiveArtifactsFromContext(context, ["character_governance_state", "continuity_state"]);
      return {
        readiness: readyState({ evidence: { artifactCount: activeArtifacts.length } }),
        completion: activeArtifacts.length > 0
          ? completedFact(DIRECTOR_EXECUTION_STEP_IDS.character_resource_sync, { evidence: { artifactCount: activeArtifacts.length }, producedArtifacts: activeArtifacts })
          : pendingFact(DIRECTOR_EXECUTION_STEP_IDS.character_resource_sync, { evidence: { artifactCount: 0 } }),
        progress: buildSimpleProgress({
          status: activeArtifacts.length > 0 ? "completed" : "partially_done",
          ratio: activeArtifacts.length > 0 ? 1 : 0,
          label: activeArtifacts.length > 0 ? "角色治理与连续性状态已同步" : "等待同步角色治理与连续性状态",
          evidence: { artifactCount: activeArtifacts.length },
          nextAction: activeArtifacts.length > 0 ? "continue_chapter_execution" : "sync_character_resources",
        }),
      };
    },
  }),
quality_repair: createFactOnlyExecutionModule({
    descriptor: createWorkflowStepDescriptorFromDirectorAdapter({
      id: DIRECTOR_EXECUTION_STEP_IDS.quality_repair,
      stage: "quality_repair",
      adapter: getDirectorExecutionNodeAdapter("quality_repair"),
    }),
    inspectFacts: async (context) => {
      const progressSummary = await inspectScopedChapterExecutionProgress(context);
      const draftedChapterCount = progressSummary?.draftedChapterCount ?? 0;
      const reviewedChapterCount = progressSummary?.chapters?.filter((chapter) => chapterHasCompletedStage(chapter, "audit_completed")).length ?? 0;
      const needsRepairChapters = progressSummary?.needsRepairChapters ?? 0;
      const hasRepairContext = reviewedChapterCount > 0 || needsRepairChapters > 0;
      const progress = {
        needsRepairChapters: hasRepairContext ? needsRepairChapters : 1,
        totalChapters: Math.max(draftedChapterCount, 1),
      };
      return {
        readiness: draftedChapterCount === 0
          ? blockedState("Draft chapters are required before quality repair.", {
            code: "missing_chapter_drafts",
            nextAction: "continue_chapter_execution",
          })
          : hasRepairContext
            ? readyState({ evidence: { draftedChapterCount, reviewedChapterCount, needsRepairChapters } })
            : blockedState("Quality review facts must exist before quality repair.", {
              code: "missing_quality_review_facts",
              evidence: { draftedChapterCount, reviewedChapterCount, needsRepairChapters },
              nextAction: "run_quality_review",
            }),
        completion: hasRepairContext && needsRepairChapters === 0
          ? completedFact(DIRECTOR_EXECUTION_STEP_IDS.quality_repair, { evidence: { draftedChapterCount, reviewedChapterCount, needsRepairChapters: 0 } })
          : pendingFact(DIRECTOR_EXECUTION_STEP_IDS.quality_repair, {
            ratio: hasRepairContext ? Math.max(0, 1 - (needsRepairChapters / Math.max(draftedChapterCount, 1))) : 0,
            evidence: { draftedChapterCount, reviewedChapterCount, needsRepairChapters, totalChapters: draftedChapterCount },
          }),
        progress: buildSimpleProgress({
          status: draftedChapterCount === 0 ? "blocked" : hasRepairContext ? ((progress?.needsRepairChapters ?? 0) === 0 ? "completed" : "needs_review") : "not_started",
          ratio: hasRepairContext ? Math.max(0, 1 - (needsRepairChapters / Math.max(draftedChapterCount, 1))) : 0,
          label: (progress?.needsRepairChapters ?? 0) === 0 ? "质量修复链已收敛" : "仍有章节等待质量修复",
          evidence: { draftedChapterCount, reviewedChapterCount, needsRepairChapters },
          nextAction: draftedChapterCount === 0 ? "continue_chapter_execution" : hasRepairContext ? ((progress?.needsRepairChapters ?? 0) === 0 ? "continue_chapter_execution" : "repair_chapter") : "run_quality_review",
        }),
      };
    },
  }),
};
