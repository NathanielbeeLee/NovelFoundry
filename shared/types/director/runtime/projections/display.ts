import type { DirectorRuntimeProjectionStatus } from "./runtimeProjection.js";

export type DirectorDisplayStageKey =
  | "project_setup"
  | "story_planning"
  | "world_setup"
  | "character_setup"
  | "volume_strategy"
  | "structured_outline"
  | "chapter_execution"
  | "quality_repair";

export type DirectorDisplayMode =
  | "idle"
  | "running"
  | "waiting"
  | "needs_recovery"
  | "failed"
  | "completed";

export type DirectorDisplayStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "attention";

export interface DirectorDisplayStep {
  key: DirectorDisplayStageKey;
  label: string;
  status: DirectorDisplayStepStatus;
  isCurrent: boolean;
}

export interface DirectorDisplayState {
  stageKey: DirectorDisplayStageKey;
  stageLabel: string;
  stepIndex: number;
  totalSteps: number;
  mode: DirectorDisplayMode;
  headline: string;
  description: string;
  currentAction: string;
  checkpointLabel: string;
  progressPercent: number;
  nextActionLabel?: string | null;
  currentFactStepId?: string | null;
  currentFactStepLabel?: string | null;
  currentFactDescription?: string | null;
  requiresUserAction: boolean;
  isLiveRunning: boolean;
  needsRecovery: boolean;
  steps: DirectorDisplayStep[];
}

export type DirectorDashboardMode =
  | "idle"
  | "queued"
  | "running"
  | "waiting_user"
  | "recovering"
  | "failed"
  | "completed";

export type DirectorDashboardProgressSource =
  | "task_final"
  | "task_live"
  | "worker_live"
  | "chapter_facts"
  | "checkpoint"
  | "runtime_projection"
  | "fallback";

export type DirectorDashboardActionType =
  | "confirm_and_continue"
  | "background_continue"
  | "open_task_center"
  | "resume_from_checkpoint"
  | "retry";

export interface DirectorDashboardAction {
  type: DirectorDashboardActionType;
  label: string;
  emphasis: "primary" | "secondary" | "destructive";
}

export interface DirectorDashboardDiagnostic {
  code: string;
  label: string;
  detail?: string | null;
  level: "info" | "warning" | "danger";
  source: "task" | "projection" | "facts" | "worker" | "artifact";
}

export interface DirectorDashboardSourceTrace {
  taskStatus?: string | null;
  projectionStatus?: DirectorRuntimeProjectionStatus | null;
  commandStatus?: string | null;
  activeStepStatus?: string | null;
  checkpointType?: string | null;
  progressSource: DirectorDashboardProgressSource;
}

export interface DirectorDashboardView {
  mode: DirectorDashboardMode;
  statusLabel: string;
  headline: string;
  description: string;
  currentAction: string | null;
  progressPercent: number;
  progressSource: DirectorDashboardProgressSource;
  requiresUserAction: boolean;
  userActionReason?: string | null;
  primaryAction?: DirectorDashboardAction | null;
  secondaryActions: DirectorDashboardAction[];
  stageKey: DirectorDisplayStageKey;
  stageLabel: string;
  stepIndex: number;
  totalSteps: number;
  steps: DirectorDisplayStep[];
  diagnostics: DirectorDashboardDiagnostic[];
  sourceTrace: DirectorDashboardSourceTrace;
}
