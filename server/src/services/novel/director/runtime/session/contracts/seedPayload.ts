import type { DirectorAutoExecutionPlan, DirectorAutoExecutionState, DirectorCandidate, DirectorCandidateBatch, DirectorCandidatesRequest, DirectorConfirmRequest, DirectorCorrectionPreset, DirectorLLMOptions, DirectorProjectContextInput, DirectorRunMode, DirectorSessionState, DirectorTaskNotice } from "@novelfoundry/shared/types/novelDirector";
import type { DirectorRuntimeSnapshot } from "@novelfoundry/shared/types/directorRuntime";
import { type DirectorAutoApprovalConfig } from "@novelfoundry/shared/types/autoDirectorApproval";
import type { NovelWorkflowResumeTarget } from "@novelfoundry/shared/types/novelWorkflow";

export type LLMOptions = Pick<DirectorCandidatesRequest, "provider" | "model" | "temperature">;

export type DirectorCandidateStageMode =
  | "generate"
  | "refine"
  | "patch_candidate"
  | "refine_titles";

export interface DirectorCandidateStageState {
  mode: DirectorCandidateStageMode;
  presets?: DirectorCorrectionPreset[];
  feedback?: string | null;
  batchId?: string | null;
  candidateId?: string | null;
}

export interface DirectorWorkflowSeedPayload extends Record<string, unknown> {
  productionExperience?: "simple" | "professional";
  pendingProductionExperience?: "professional";
  startupPreparation?: DirectorConfirmRequest["startupPreparation"];
  novelId?: string | null;
  provider?: DirectorLLMOptions["provider"] | null;
  model?: string | null;
  temperature?: number | null;
  runMode?: DirectorRunMode;
  autoExecutionPlan?: DirectorAutoExecutionPlan;
  autoApproval?: DirectorAutoApprovalConfig | null;
  batches?: DirectorCandidateBatch[];
  candidateStage?: DirectorCandidateStageState | null;
  candidate?: DirectorCandidate;
  batch?: {
    id?: string;
    round?: number;
  };
  directorInput?: DirectorConfirmRequest;
  directorSession?: DirectorSessionState;
  resumeTarget?: NovelWorkflowResumeTarget | null;
  autoExecution?: DirectorAutoExecutionState;
  taskNotice?: DirectorTaskNotice | null;
  directorRuntime?: DirectorRuntimeSnapshot | null;
  stepReview?: {
    stepId: string;
    nodeKey: string;
    label: string;
    targetType: string;
    targetId?: string | null;
    completedAt: string;
  } | null;
}

export interface CandidateGenerationContext {
  idea: string;
  count: number;
  batches: DirectorCandidateBatch[];
  presets: DirectorCorrectionPreset[];
  feedback?: string;
  request: DirectorProjectContextInput;
  options: LLMOptions;
}
