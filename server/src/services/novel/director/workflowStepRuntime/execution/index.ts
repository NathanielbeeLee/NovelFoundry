import { getDirectorExecutionNodeAdapter, type DirectorExecutionStage } from "../../phases/novelDirectorExecutionNodeAdapters";
import { createWorkflowStepDescriptorFromDirectorAdapter, type WorkflowStepModuleDescriptor } from "../WorkflowStepModule";
import { DIRECTOR_EXECUTION_STEP_IDS } from "../directorWorkflowStepIds";
import { createChapterDraftExecutableModule } from "./drafting/ChapterDraftStepModule";
import { CHAPTER_QUALITY_STEP_MODULES } from "./quality/ChapterQualityStepModules";
export { DIRECTOR_EXECUTION_CONTRACT_SYNC_STEP_MODULE } from "./contracts/ChapterContractSyncStepModule";

export const DIRECTOR_EXECUTION_STEP_MODULES: Record<DirectorExecutionStage, WorkflowStepModuleDescriptor> = {
  chapter_execution: createChapterDraftExecutableModule(createWorkflowStepDescriptorFromDirectorAdapter({
    id: DIRECTOR_EXECUTION_STEP_IDS.chapter_execution,
    stage: "chapter_execution",
    adapter: getDirectorExecutionNodeAdapter("chapter_execution"),
    promptAssets: [{ id: "novel.chapter.writer", version: "v5" }],
  })),
  ...CHAPTER_QUALITY_STEP_MODULES,
};
