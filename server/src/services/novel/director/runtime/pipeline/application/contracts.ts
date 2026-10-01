import type { DirectorConfirmRequest } from "@novelfoundry/shared/types/novelDirector";
import type { BookContractService } from "../../../../BookContractService";
import type { CharacterPreparationService } from "../../../../characterPrep/CharacterPreparationService";
import type { CharacterDynamicsService } from "../../../../dynamics/CharacterDynamicsService";
import type { NovelContextService } from "../../../../NovelContextService";
import type { StoryMacroPlanService } from "../../../../storyMacro/StoryMacroPlanService";
import type { NovelVolumeService } from "../../../../volume/NovelVolumeService";
import type { NovelWorkflowService } from "../../../../workflow/NovelWorkflowService";
import { buildWorkflowSeedPayload } from "../../novelDirectorHelpers";
import type { NovelDirectorRuntimeOrchestrator } from "../../novelDirectorRuntimeOrchestrator";
import type { DirectorPipelinePhase } from "../../../recovery/novelDirectorRecovery";

export interface DirectorPipelineRunInput {
  taskId: string;
  novelId: string;
  input: DirectorConfirmRequest;
  startPhase: Exclude<DirectorPipelinePhase, "book_contract">;
  scope?: string | null;
  batchAlreadyStartedCount?: number;
  approveCurrentGate?: boolean;
  approveAutoExecutionScope?: boolean;
}

export interface DirectorPipelineDependencies {
    workflowService: NovelWorkflowService;
    novelContextService: NovelContextService;
    characterDynamicsService: CharacterDynamicsService;
    characterPreparationService: CharacterPreparationService;
    storyMacroService: StoryMacroPlanService;
    bookContractService: BookContractService;
    volumeService: NovelVolumeService;
    runtimeOrchestrator: NovelDirectorRuntimeOrchestrator;
    buildDirectorSeedPayload: (
      input: DirectorConfirmRequest,
      novelId: string | null,
      extra?: Record<string, unknown>,
    ) => ReturnType<typeof buildWorkflowSeedPayload>;
    assertHighMemoryStartAllowed: (input: {
      taskId: string;
      novelId: string;
      stage: "structured_outline";
      itemKey: "beat_sheet" | "chapter_list" | "chapter_detail_bundle" | "chapter_sync";
      volumeId?: string | null;
      chapterId?: string | null;
      scope?: string | null;
      batchAlreadyStartedCount?: number;
    }) => Promise<void>;
  }
