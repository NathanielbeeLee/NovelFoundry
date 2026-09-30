import { getWorkflowStepCatalogEntry } from "@novelfoundry/shared/types/directorWorkflowStepCatalog";
import { createWorkflowStepDescriptorFromCatalogEntry, createWorkflowStepModule, type WorkflowStepModule, type WorkflowStepModuleDescriptor } from "../../WorkflowStepModule";
import { blockedState, buildSimpleProgress, completedFact, getDirectorCoreStateCommitter, getDirectorCoreStepRuntime, loadDirectorModuleState, loadFactBaseSummary, pendingFact, readyState } from "../../directorWorkflowStepShared";
import { DIRECTOR_EXECUTION_CONTRACT_SYNC_STEP_ID } from "../../directorWorkflowStepIds";

function createChapterExecutionContractSyncModule(
  descriptor: WorkflowStepModuleDescriptor,
): WorkflowStepModule<{ novelId: string }, void> {
  return createWorkflowStepModule(
    descriptor,
    async (input) => getDirectorCoreStepRuntime().executeChapterExecutionContractSyncStep(input),
    {
      inspectReadiness: async (context) => {
        const summary = await loadFactBaseSummary(context);
        const plannedChapterCount = summary.outline.plannedChapterCount;
        const syncedChapterCount = summary.outline.syncedChapterCount;
        const unsyncedChapterCount = Math.max(0, plannedChapterCount - syncedChapterCount);
        if (plannedChapterCount === 0) {
          return blockedState("Chapter planning must finish before execution-ready chapter records can be checked.", {
            code: "missing_chapter_plan",
            evidence: { plannedChapterCount, syncedChapterCount, unsyncedChapterCount },
            nextAction: "run_chapter_detail_generation",
          });
        }
        return readyState({
          evidence: { plannedChapterCount, syncedChapterCount, unsyncedChapterCount },
          resumeFrom: syncedChapterCount >= plannedChapterCount ? "chapter_execution_contract_sync_done" : "chapter_execution_contract_sync",
        });
      },
      inspectCompletion: async (context) => {
        const summary = await loadFactBaseSummary(context);
        const plannedChapterCount = summary.outline.plannedChapterCount;
        const syncedChapterCount = summary.outline.syncedChapterCount;
        const unsyncedChapterCount = Math.max(0, plannedChapterCount - syncedChapterCount);
        return plannedChapterCount > 0 && syncedChapterCount >= plannedChapterCount
          ? completedFact(descriptor.id, { evidence: { plannedChapterCount, syncedChapterCount, unsyncedChapterCount } })
          : pendingFact(descriptor.id, {
            ratio: plannedChapterCount > 0 ? Math.min(1, syncedChapterCount / plannedChapterCount) : 0,
            evidence: { plannedChapterCount, syncedChapterCount, unsyncedChapterCount },
          });
      },
      buildInput: async (context) => {
        const { novelId } = await loadDirectorModuleState(context);
        return { novelId };
      },
      validateOutput: async (_output, context) => {
        const summary = await loadFactBaseSummary(context);
        const plannedChapterCount = summary.outline.plannedChapterCount;
        const syncedChapterCount = summary.outline.syncedChapterCount;
        return {
          valid: plannedChapterCount > 0 && syncedChapterCount >= plannedChapterCount,
          reason: "Execution-ready chapter records are not complete yet.",
        };
      },
      commit: async (_output, context) => {
        const { state, novelId } = await loadDirectorModuleState(context);
        const producedArtifacts = await getDirectorCoreStepRuntime().collectWrittenArtifacts(
          novelId,
          state.task.id,
          ["chapter_task_sheet"],
        );
        await getDirectorCoreStateCommitter().recordArtifactsIndexed({
          taskId: state.task.id,
          novelId,
          runtimeId: state.runtime?.id ?? null,
          nodeKey: descriptor.nodeKey,
          artifacts: producedArtifacts,
        });
        return {
          producedArtifacts,
          summary: "章节规划已同步到正式章节执行区。",
        };
      },
      inspectProgress: async (context) => {
        const summary = await loadFactBaseSummary(context);
        const plannedChapterCount = summary.outline.plannedChapterCount;
        const syncedChapterCount = summary.outline.syncedChapterCount;
        return buildSimpleProgress({
          status: plannedChapterCount > 0 && syncedChapterCount >= plannedChapterCount ? "completed" : "partially_done",
          ratio: plannedChapterCount > 0 ? Math.min(1, syncedChapterCount / plannedChapterCount) : 0,
          label: plannedChapterCount > 0 && syncedChapterCount >= plannedChapterCount
            ? "正式章节已同步完成"
            : "正在把章节规划同步到正式章节执行区",
          evidence: { plannedChapterCount, syncedChapterCount },
          nextAction: plannedChapterCount > 0 && syncedChapterCount >= plannedChapterCount ? null : "sync_execution_contracts",
        });
      },
      recover: async (_context) => ({
        recoverable: true,
        resumeFrom: "chapter_execution_contract_sync",
        reason: "Formal chapter sync can rerun from the current workspace.",
      }),
      completeCriteria: async (_output, context) => {
        const summary = await loadFactBaseSummary(context);
        const plannedChapterCount = summary.outline.plannedChapterCount;
        const syncedChapterCount = summary.outline.syncedChapterCount;
        return plannedChapterCount > 0 && syncedChapterCount >= plannedChapterCount;
      },
    },
  );
}

export const DIRECTOR_EXECUTION_CONTRACT_SYNC_STEP_MODULE = createChapterExecutionContractSyncModule({
  ...createWorkflowStepDescriptorFromCatalogEntry({
    entry: getWorkflowStepCatalogEntry(DIRECTOR_EXECUTION_CONTRACT_SYNC_STEP_ID),
  }),
  defaultWaitingState: {
    stage: "structured_outline",
    itemKey: "chapter_sync",
    itemLabel: "正在同步正式章节执行合同",
    progress: 0.9,
  },
});
