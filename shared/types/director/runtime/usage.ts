import type { DirectorStepRunStatus } from "./facts.js";

export type DirectorUsageAttributionStatus =
  | "step_attributed"
  | "task_only"
  | "unattributed";

export interface DirectorLlmUsageSummary {
  llmCallCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  durationMs?: number | null;
  lastRecordedAt?: string | null;
}

export type DirectorBookTokenBudgetStatus = "disabled" | "within_limit" | "warning" | "exhausted";

export interface DirectorBookTokenBudgetSummary {
  limitTokens: number | null;
  warnRatio: number;
  usedTokens: number;
  remainingTokens: number | null;
  usageRatio: number | null;
  llmCallCount: number;
  lastRecordedAt?: string | null;
  status: DirectorBookTokenBudgetStatus;
  trackingStatus: "active" | "no_usage_yet";
}

export interface DirectorBookTokenBudgetUpdateRequest {
  limitTokens: number | null;
  warnRatio?: number;
}

export interface DirectorBookTokenBudgetResponse {
  tokenBudget: DirectorBookTokenBudgetSummary;
}

export interface DirectorLlmUsageRecordSummary extends DirectorLlmUsageSummary {
  id: string;
  novelId?: string | null;
  taskId?: string | null;
  runId?: string | null;
  chapterId?: string | null;
  volumeId?: string | null;
  stage?: string | null;
  itemKey?: string | null;
  scope?: string | null;
  entrypoint?: string | null;
  stepIdempotencyKey?: string | null;
  nodeKey?: string | null;
  promptAssetKey?: string | null;
  promptVersion?: string | null;
  modelRoute?: string | null;
  provider?: string | null;
  model?: string | null;
  status: string;
  attributionStatus: DirectorUsageAttributionStatus | string;
  recordedAt: string;
}

export interface DirectorStepUsageSummary extends DirectorLlmUsageSummary {
  stepIdempotencyKey: string;
  nodeKey: string;
  label?: string | null;
  status?: DirectorStepRunStatus | string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  attributionStatus: DirectorUsageAttributionStatus | string;
}

export interface DirectorPromptUsageSummary extends DirectorLlmUsageSummary {
  promptAssetKey: string;
  promptVersion?: string | null;
  nodeKey?: string | null;
  stepIdempotencyKey?: string | null;
  label?: string | null;
  attributionStatus: DirectorUsageAttributionStatus | string;
}
