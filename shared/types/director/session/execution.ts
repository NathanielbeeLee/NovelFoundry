import type { ArtifactSyncMode, PipelineJobStatus } from "../../novel";
import { DIRECTOR_FULL_BOOK_AUTOPILOT_RUN_MODE, DIRECTOR_FULL_BOOK_AUTOPILOT_INTERRUPT_REASONS, DIRECTOR_AUTO_EXECUTION_RUN_MODES } from "./modes.js";
import type { DirectorFullBookAutopilotInterruptReason, DirectorRunMode, DirectorAutoExecutionRunMode } from "./modes.js";
import type { DirectorCompletionProfile } from "./completion";
import type { DirectorQualityLoopBudgetLedger, DirectorQualityRepairRisk, DirectorCircuitBreakerState } from "./quality.js";

export const DIRECTOR_MIN_TARGET_CHAPTER_COUNT = 12;

export const DIRECTOR_MAX_TARGET_CHAPTER_COUNT = 2000;

export const DIRECTOR_AUTO_EXECUTION_MODES = [
  "book",
  "chapter_range",
  "volume",
] as const;

export type DirectorAutoExecutionMode = typeof DIRECTOR_AUTO_EXECUTION_MODES[number];

export interface DirectorAutoExecutionPlan {
  mode: DirectorAutoExecutionMode;
  startOrder?: number;
  endOrder?: number;
  volumeOrder?: number;
  autoReview?: boolean;
  autoRepair?: boolean;
  artifactSyncMode?: ArtifactSyncMode;
}

export interface DirectorFullBookAutopilotContract {
  runMode: typeof DIRECTOR_FULL_BOOK_AUTOPILOT_RUN_MODE;
  autoExecutionPlan: DirectorAutoExecutionPlan & {
    mode: "book";
    autoReview: true;
    autoRepair: true;
  };
  userApprovalBoundary: "infrastructure_or_data_risk";
  interruptReasons: readonly DirectorFullBookAutopilotInterruptReason[];
}

export const DIRECTOR_FULL_BOOK_AUTOPILOT_CONTRACT = {
  runMode: DIRECTOR_FULL_BOOK_AUTOPILOT_RUN_MODE,
  autoExecutionPlan: {
    mode: "book",
    autoReview: true,
    autoRepair: true,
  },
  userApprovalBoundary: "infrastructure_or_data_risk",
  interruptReasons: DIRECTOR_FULL_BOOK_AUTOPILOT_INTERRUPT_REASONS,
} as const satisfies DirectorFullBookAutopilotContract;

export function isDirectorAutoExecutionRunMode(
  runMode: DirectorRunMode | string | null | undefined,
): runMode is DirectorAutoExecutionRunMode {
  return typeof runMode === "string"
    && (DIRECTOR_AUTO_EXECUTION_RUN_MODES as readonly string[]).includes(runMode);
}

export function isFullBookAutopilotRunMode(
  runMode: DirectorRunMode | string | null | undefined,
): runMode is typeof DIRECTOR_FULL_BOOK_AUTOPILOT_RUN_MODE {
  return runMode === DIRECTOR_FULL_BOOK_AUTOPILOT_RUN_MODE;
}

export function buildFullBookAutopilotExecutionPlan(): DirectorAutoExecutionPlan {
  return {
    ...DIRECTOR_FULL_BOOK_AUTOPILOT_CONTRACT.autoExecutionPlan,
  };
}

export type DirectorContinuationMode = "resume" | "auto_execute_range" | "skip_quality_repair";

export const DIRECTOR_STEP_CALIBRATION_ACTIONS = ["validate", "improve", "regenerate"] as const;

export type DirectorStepCalibrationAction = typeof DIRECTOR_STEP_CALIBRATION_ACTIONS[number];

export interface DirectorStepCalibrationRequest {
  stepId: string;
  action: DirectorStepCalibrationAction;
  instruction?: string | null;
  targetId?: string | null;
}

export function normalizeDirectorContinuationMode(
  value: unknown,
): DirectorContinuationMode | null {
  if (value === "resume" || value === "auto_execute_range" || value === "skip_quality_repair") {
    return value;
  }
  return null;
}

export interface DirectorAutoExecutionState extends DirectorAutoExecutionPlan {
  enabled: boolean;
  completionProfile?: DirectorCompletionProfile;
  closingExtensionCount?: number;
  scopeLabel?: string | null;
  volumeTitle?: string | null;
  preparedVolumeIds?: string[];
  beatChapterListReady?: boolean;
  volumeChapterListComplete?: boolean;
  skippedChapterIds?: string[];
  skippedChapterOrders?: number[];
  qualityDebtChapterIds?: string[];
  qualityDebtChapterOrders?: number[];
  qualityDebtSummaries?: Array<{
    chapterId?: string | null;
    chapterOrder?: number | null;
    reason: string;
    source: "quality_loop" | "replan_loop" | "repair_failure" | "review_skip";
    deferredAt: string;
  }>;
  qualityLoopLedger?: DirectorQualityLoopBudgetLedger | null;
  firstChapterId?: string | null;
  startOrder?: number;
  endOrder?: number;
  totalChapterCount?: number;
  completedChapterCount?: number;
  remainingChapterCount?: number;
  remainingChapterIds?: string[];
  remainingChapterOrders?: number[];
  nextChapterId?: string | null;
  nextChapterOrder?: number | null;
  pipelineJobId?: string | null;
  pipelineStatus?: PipelineJobStatus | null;
  qualityRepairRisk?: DirectorQualityRepairRisk | null;
  circuitBreaker?: DirectorCircuitBreakerState | null;
}
