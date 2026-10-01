import type { DirectorAutoExecutionPlan, DirectorRunMode } from "@novelfoundry/shared/types/novelDirector";
import { DIRECTOR_MAX_TARGET_CHAPTER_COUNT, DIRECTOR_MIN_TARGET_CHAPTER_COUNT, buildFullBookAutopilotExecutionPlan, isFullBookAutopilotRunMode } from "@novelfoundry/shared/types/novelDirector";
import { buildFullDirectorAutoApprovalConfig, type DirectorAutoApprovalConfig } from "@novelfoundry/shared/types/autoDirectorApproval";

export function normalizeDirectorRunMode(runMode: DirectorRunMode | undefined): DirectorRunMode {
  if (runMode === "full_book_autopilot") {
    return "full_book_autopilot";
  }
  if (runMode === "stage_review") {
    return "stage_review";
  }
  if (runMode === "auto_to_execution") {
    return "auto_to_execution";
  }
  return "auto_to_ready";
}

export function applyDirectorRunModeContract<T extends {
  runMode?: DirectorRunMode;
  autoExecutionPlan?: DirectorAutoExecutionPlan;
  autoApproval?: DirectorAutoApprovalConfig;
}>(input: T): T & { runMode: DirectorRunMode } {
  const runMode = normalizeDirectorRunMode(input.runMode);
  if (!isFullBookAutopilotRunMode(runMode)) {
    return {
      ...input,
      runMode,
    };
  }
  return {
    ...input,
    runMode,
    autoExecutionPlan: input.autoExecutionPlan?.mode === "chapter_range"
      ? input.autoExecutionPlan
      : buildFullBookAutopilotExecutionPlan(),
    autoApproval: buildFullDirectorAutoApprovalConfig(),
  };
}

export function normalizeDirectorTargetChapterCount(value: number | null | undefined, fallback = 80): number {
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(
    DIRECTOR_MIN_TARGET_CHAPTER_COUNT,
    Math.min(DIRECTOR_MAX_TARGET_CHAPTER_COUNT, Math.round(numericValue)),
  );
}
