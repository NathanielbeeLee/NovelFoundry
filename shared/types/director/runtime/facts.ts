import type { DirectorArtifactRef, DirectorArtifactTargetType } from "./artifacts.js";
import type { DirectorPolicyDecision } from "./policy.js";

export interface DirectorStepBlocker {
  code: string;
  reason: string;
  retryable?: boolean;
  nextAction?: string | null;
  evidence?: Record<string, unknown>;
}

export interface DirectorStepCompletionEvidence {
  stepId: string;
  completed: boolean;
  completenessRatio: number;
  evidence?: Record<string, unknown>;
  producedArtifacts?: DirectorArtifactRef[];
}

export interface DirectorRecoveryCursor {
  stepId: string;
  resumeFrom?: string | null;
  scope?: string | null;
  targetId?: string | null;
  evidence?: Record<string, unknown>;
}

export interface DirectorStepFactInspection {
  stepId: string;
  ready: boolean;
  completed: boolean;
  blockers: DirectorStepBlocker[];
  evidence?: Record<string, unknown>;
  producedArtifacts?: DirectorArtifactRef[];
  completenessRatio: number;
  nextAction?: string | null;
  resumeFrom?: string | null;
}

export type DirectorStepRunStatus =
  | "running"
  | "succeeded"
  | "failed"
  | "skipped"
  | "waiting_approval"
  | "blocked_scope";

export interface DirectorStepRun {
  idempotencyKey: string;
  nodeKey: string;
  label: string;
  status: DirectorStepRunStatus;
  targetType?: DirectorArtifactTargetType | null;
  targetId?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  error?: string | null;
  producedArtifacts?: DirectorArtifactRef[];
  policyDecision?: DirectorPolicyDecision | null;
}

export interface DirectorOutlineFactSummary {
  beatSheetReady: boolean;
  chapterListReady: boolean;
  beatChapterListReady?: boolean;
  volumeChapterListComplete?: boolean;
  chapterDetailReady: boolean;
  plannedChapterCount: number;
  selectedChapterCount: number;
  completedDetailSteps: number;
  totalDetailSteps: number;
  syncedChapterCount: number;
}

export interface DirectorChapterExecutionFactSummary {
  totalChapters: number;
  draftedChapterCount: number;
  reviewedChapterCount: number;
  approvedChapterCount: number;
  committedChapterCount: number;
  completedChapters: number;
  needsRepairChapters: number;
  ratio: number;
  expectedChapterCount?: number | null;
}

export interface DirectorRepairFactSummary {
  draftedChapterCount: number;
  reviewedChapterCount: number;
  committedChapterCount: number;
  needsRepairChapters: number;
  payoffArtifactCount: number;
  characterResourceArtifactCount: number;
}

export interface DirectorTaskFactSummaryStep {
  stepId: string;
  label: string;
  stage: string;
  completed: boolean;
  completenessRatio: number;
  evidence?: Record<string, unknown>;
  nextAction?: string | null;
}

export interface DirectorTaskFactSummary {
  allStepsCompleted: boolean;
  completedStepCount: number;
  totalStepCount: number;
  currentFactStepId?: string | null;
  currentFactStepLabel?: string | null;
  currentFactEvidence?: Record<string, unknown> | null;
  hasNovelProject: boolean;
  hasStoryMacro: boolean;
  hasBookContract: boolean;
  characterCount: number;
  hasVolumeStrategy: boolean;
  volumeCount: number;
  outlineFacts: DirectorOutlineFactSummary;
  chapterExecutionFacts: DirectorChapterExecutionFactSummary;
  repairFacts: DirectorRepairFactSummary;
  steps: DirectorTaskFactSummaryStep[];
}

export type ChapterExecutionProgressStage =
  | "execution_contract_ready"
  | "context_package_ready"
  | "draft_started"
  | "draft_saved"
  | "audit_completed"
  | "repair_completed_or_not_needed"
  | "runtime_package_saved"
  | "chapter_artifacts_synced"
  | "chapter_state_committed"
  | "reviewable_or_approved";

export interface DirectorChapterExecutionProgressItem {
  chapterId: string;
  chapterOrder: number;
  status: string;
  currentStage: ChapterExecutionProgressStage;
  completedStages: ChapterExecutionProgressStage[];
  missingStages: ChapterExecutionProgressStage[];
  recoverable: boolean;
  nextAction: string;
}

export interface DirectorChapterExecutionProgressSummary {
  totalChapters: number;
  draftedChapterCount: number;
  approvedChapterCount: number;
  completedChapters: number;
  needsRepairChapters: number;
  activeChapterId?: string | null;
  activeChapterOrder?: number | null;
  currentChapterId?: string | null;
  currentChapterOrder?: number | null;
  currentStage?: ChapterExecutionProgressStage | null;
  recoverableRange?: {
    startOrder: number | null;
    endOrder: number | null;
  };
  ratio: number;
  chapters?: DirectorChapterExecutionProgressItem[];
}

export interface DirectorTaskFactInspectionStep {
  stepId: string;
  label: string;
  stage: string;
  targetType: DirectorArtifactTargetType;
  ready: boolean;
  completed: boolean;
  completenessRatio: number;
  nextAction?: string | null;
  resumeFrom?: string | null;
  blockers: DirectorStepBlocker[];
  evidence?: Record<string, unknown>;
  producedArtifacts?: DirectorArtifactRef[];
  progress?: {
    status: string;
    ratio: number;
    label: string;
    nextAction?: string | null;
    evidence?: Record<string, unknown>;
  } | null;
  inspectError?: string | null;
  isCurrentFactStep?: boolean;
  isActiveRuntimeStep?: boolean;
}

export interface DirectorTaskFactInspection {
  taskId: string;
  novelId?: string | null;
  currentFactStepId?: string | null;
  currentFactStepLabel?: string | null;
  currentFactEvidence?: Record<string, unknown> | null;
  factSummary?: DirectorTaskFactSummary | null;
  steps: DirectorTaskFactInspectionStep[];
}

export interface DirectorTaskFactInspectionResponse {
  inspection: DirectorTaskFactInspection | null;
}
