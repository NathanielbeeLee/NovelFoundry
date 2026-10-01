import type { DirectorCandidateBatch } from "./candidates.js";
import type { NovelCreateResourceRecommendation } from "../../novelResourceRecommendation";
import type { DirectorRunMode } from "./modes.js";
import type { DirectorAutoExecutionPlan } from "./execution.js";
import type { DirectorAutoApprovalConfig } from "../approval/approval";
import type { StyleIntentSummary } from "../../styleEngine";

export interface DirectorTaskNoticeAction {
  type: "open_structured_outline";
  label: string;
  volumeId?: string | null;
}

export interface DirectorTaskNotice {
  code: string;
  summary: string;
  action?: DirectorTaskNoticeAction | null;
}

export interface DirectorTaskSeedPayloadSnapshot {
  idea?: string;
  batches?: DirectorCandidateBatch[];
  productionFoundation?: NovelCreateResourceRecommendation;
  directorCommandResults?: Record<string, unknown>;
  worldId?: string | null;
  worldSetupMode?: "auto_generate" | "skip" | null;
  runMode?: DirectorRunMode;
  autoExecutionPlan?: DirectorAutoExecutionPlan;
  autoApproval?: DirectorAutoApprovalConfig | null;
  styleProfileId?: string | null;
  styleIntentSummary?: StyleIntentSummary | null;
  postGenerationStyleReviewEnabled?: boolean | null;
  taskNotice?: DirectorTaskNotice | null;
  stepReview?: {
    stepId: string;
    nodeKey: string;
    label: string;
    targetType: string;
    targetId?: string | null;
    completedAt: string;
  } | null;
}

export function extractDirectorTaskSeedPayload(
  seedPayload: unknown,
): DirectorTaskSeedPayloadSnapshot | null {
  if (!seedPayload || typeof seedPayload !== "object") {
    return null;
  }
  return seedPayload as DirectorTaskSeedPayloadSnapshot;
}

export function extractDirectorTaskSeedPayloadFromMeta(
  meta: Record<string, unknown> | null | undefined,
): DirectorTaskSeedPayloadSnapshot | null {
  if (!meta || typeof meta !== "object") {
    return null;
  }
  return extractDirectorTaskSeedPayload((meta as { seedPayload?: unknown }).seedPayload);
}
