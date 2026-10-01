import type { NovelWorkflowStage, NovelWorkflowResumeTarget } from "../workflow/workflow";
import type { PipelineJobStatus } from "../../novel";
import type { DirectorLLMOptions } from "./projectContext.js";
import type { DirectorAutoExecutionPlan } from "./execution.js";
import type { DirectorAutoApprovalConfig } from "../approval/approval";
import type { DirectorSessionState } from "./sessionState.js";

export const DIRECTOR_TAKEOVER_START_PHASES = [
  "story_macro",
  "world_setup",
  "character_setup",
  "volume_strategy",
  "structured_outline",
] as const;

export type DirectorTakeoverStartPhase = typeof DIRECTOR_TAKEOVER_START_PHASES[number];

export const DIRECTOR_TAKEOVER_ENTRY_STEPS = [
  "basic",
  "story_macro",
  "world",
  "character",
  "outline",
  "structured",
  "chapter",
  "pipeline",
] as const;

export type DirectorTakeoverEntryStep = typeof DIRECTOR_TAKEOVER_ENTRY_STEPS[number];

export const DIRECTOR_TAKEOVER_STRATEGIES = [
  "continue_existing",
  "restart_current_step",
] as const;

export type DirectorTakeoverStrategy = typeof DIRECTOR_TAKEOVER_STRATEGIES[number];

export interface DirectorTakeoverStageReadiness {
  phase: DirectorTakeoverStartPhase;
  label: string;
  description: string;
  available: boolean;
  recommended: boolean;
  reason: string;
}

export interface DirectorTakeoverPreview {
  strategy: DirectorTakeoverStrategy;
  summary: string;
  effectSummary: string;
  effectiveStep: DirectorTakeoverEntryStep;
  effectiveStage: NovelWorkflowStage;
  skipSteps: DirectorTakeoverEntryStep[];
  continueStep?: DirectorTakeoverEntryStep | null;
  restartStep?: DirectorTakeoverEntryStep | null;
  usesCurrentBatch?: boolean;
  impactNotes: string[];
}

export interface DirectorTakeoverEntryReadiness {
  step: DirectorTakeoverEntryStep;
  label: string;
  description: string;
  available: boolean;
  recommended: boolean;
  status: "missing" | "partial" | "ready" | "complete" | "blocked";
  reason: string;
  previews: DirectorTakeoverPreview[];
}

export interface DirectorTakeoverPipelineJobSnapshot {
  id: string;
  status: PipelineJobStatus;
  currentStage?: string | null;
  currentItemLabel?: string | null;
  completedCount: number;
  totalCount: number;
  startOrder: number;
  endOrder: number;
}

export interface DirectorTakeoverCheckpointSnapshot {
  checkpointType: "chapter_batch_ready" | "step_review_required" | "replan_required" | null;
  checkpointSummary?: string | null;
  chapterId?: string | null;
  chapterOrder?: number | null;
  volumeId?: string | null;
}

export interface DirectorTakeoverExecutableRangeSnapshot {
  startOrder: number;
  endOrder: number;
  totalChapterCount: number;
  nextChapterId?: string | null;
  nextChapterOrder?: number | null;
}

export interface DirectorTakeoverReadinessResponse {
  novelId: string;
  novelTitle: string;
  hasActiveTask: boolean;
  activeTaskId?: string | null;
  snapshot: {
    hasStoryMacroPlan: boolean;
    hasBookContract: boolean;
    hasWorldSetupPrepared: boolean;
    characterCount: number;
    chapterCount: number;
    volumeCount: number;
    firstVolumeId?: string | null;
    firstVolumeChapterCount: number;
    volumeChapterRanges?: Array<{
      volumeOrder: number;
      startOrder: number;
      endOrder: number;
    }>;
    structuredOutlineChapterOrders?: number[];
    firstVolumeBeatSheetReady?: boolean;
    firstVolumePreparedChapterCount?: number;
    generatedChapterCount?: number;
    approvedChapterCount?: number;
    pendingRepairChapterCount?: number;
    hasUnpreparedChaptersInRange?: boolean;
    missingExecutionContractOrders?: number[];
  };
  stages: DirectorTakeoverStageReadiness[];
  entrySteps: DirectorTakeoverEntryReadiness[];
  activePipelineJob?: DirectorTakeoverPipelineJobSnapshot | null;
  latestCheckpoint?: DirectorTakeoverCheckpointSnapshot | null;
  executableRange?: DirectorTakeoverExecutableRangeSnapshot | null;
}

export interface DirectorTakeoverRequest extends DirectorLLMOptions {
  novelId: string;
  startPhase?: DirectorTakeoverStartPhase;
  entryStep?: DirectorTakeoverEntryStep;
  strategy?: DirectorTakeoverStrategy;
  autoExecutionPlan?: DirectorAutoExecutionPlan;
  autoApproval?: DirectorAutoApprovalConfig;
  styleProfileId?: string;
  postGenerationStyleReviewEnabled?: boolean;
}

export interface DirectorTakeoverResponse {
  novelId: string;
  workflowTaskId: string;
  startPhase: DirectorTakeoverStartPhase;
  entryStep: DirectorTakeoverEntryStep;
  strategy: DirectorTakeoverStrategy;
  effectiveStage: NovelWorkflowStage;
  directorSession: DirectorSessionState;
  resumeTarget?: NovelWorkflowResumeTarget | null;
}
