export const DIRECTOR_CIRCUIT_BREAKER_REASONS = [
  "auto_repair_exhausted",
  "replan_loop",
  "model_unavailable",
  "service_unavailable",
  "protected_user_content",
  "unrecoverable_data_risk",
  "usage_anomaly",
] as const;

export type DirectorCircuitBreakerReason = typeof DIRECTOR_CIRCUIT_BREAKER_REASONS[number];

export interface DirectorCircuitBreakerState {
  status: "closed" | "open";
  reason?: DirectorCircuitBreakerReason | null;
  message?: string | null;
  openedAt?: string | null;
  resetAt?: string | null;
  chapterId?: string | null;
  chapterOrder?: number | null;
  nodeKey?: string | null;
  failureCount?: number;
  patchFailureCount?: number;
  replanLoopCount?: number;
  modelFailureCount?: number;
  usageAnomalyCount?: number;
  lastUsageRecordId?: string | null;
  lastEventAt?: string | null;
  recoveryAction?: "retry" | "resume_after_review" | "switch_model" | "confirm_protected_content" | "manual_repair" | null;
}

export type DirectorQualityLoopBudgetAttemptAction =
  | "patch_repair"
  | "chapter_rewrite"
  | "window_replan"
  | "defer_and_continue";

export type DirectorQualityLoopBudgetNextAction =
  | "auto_patch_repair"
  | "auto_rewrite_chapter"
  | "auto_replan_window"
  | "defer_and_continue";

export interface DirectorQualityLoopBudgetWindow {
  startOrder?: number | null;
  endOrder?: number | null;
  chapterOrders?: number[];
  chapterIds?: string[];
}

export interface DirectorQualityLoopBudgetEntry {
  signatureKey: string;
  issueSignature: string;
  blockingLedgerKeys: string[];
  affectedChapterWindow: DirectorQualityLoopBudgetWindow;
  patchRepairCount: number;
  chapterRewriteCount: number;
  windowReplanCount: number;
  deferredCount: number;
  lastAction?: DirectorQualityLoopBudgetAttemptAction | null;
  lastReason?: string | null;
  lastChapterId?: string | null;
  lastChapterOrder?: number | null;
  updatedAt: string;
}

export interface DirectorQualityLoopBudgetLedger {
  entries: DirectorQualityLoopBudgetEntry[];
  updatedAt?: string | null;
}

export type DirectorQualityRepairRiskLevel = "low" | "large_scope" | "replan";

export interface DirectorQualityRepairRisk {
  riskLevel: DirectorQualityRepairRiskLevel;
  autoContinuable: boolean;
  reason: string;
  noticeCode?: string | null;
  repairMode?: string | null;
  affectedChapterCount?: number;
  remainingChapterCount?: number;
}
