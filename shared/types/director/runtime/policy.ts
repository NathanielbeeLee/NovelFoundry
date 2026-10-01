export const DIRECTOR_POLICY_MODES = [
  "suggest_only",
  "run_next_step",
  "run_until_gate",
  "auto_safe_scope",
] as const;

export type DirectorPolicyMode = typeof DIRECTOR_POLICY_MODES[number];

export interface DirectorPolicyDecision {
  canRun: boolean;
  requiresApproval: boolean;
  gateType: "none" | "approval" | "blocked_scope";
  reason: string;
  mayOverwriteUserContent: boolean;
  affectedArtifacts: string[];
  riskTags: Array<
    | "suggest_only"
    | "protected_user_content"
    | "default_approval"
    | "expensive_review"
    | "downstream_recompute"
    | "large_scope_auto_run"
    | "quality_repair"
    | "quality_manual_repair"
    | "quality_blocked_scope"
    | "continue_with_risk"
  >;
  autoRetryBudget: number;
  onQualityFailure: "repair_once" | "pause_for_manual" | "continue_with_risk" | "block_scope";
}

export type DirectorQualityGateResult =
  | { status: "passed" }
  | { status: "repairable"; repairPlanId: string; autoRetryAllowed: true; affectedScope?: string | null }
  | { status: "needs_manual_repair"; issueIds: string[]; affectedScope: string }
  | { status: "continue_with_risk"; riskIds: string[]; affectedScope: string }
  | { status: "blocked_scope"; blockedScope: string; reason: string };

export interface DirectorRuntimePolicySnapshot {
  mode: DirectorPolicyMode;
  mayOverwriteUserContent: boolean;
  maxAutoRepairAttempts: 1;
  allowExpensiveReview: boolean;
  modelTier: "cheap_fast" | "balanced" | "high_quality";
  updatedAt: string;
}

export interface DirectorRuntimePolicyUpdateRequest {
  mode: DirectorPolicyMode;
  mayOverwriteUserContent?: boolean;
  allowExpensiveReview?: boolean;
  modelTier?: DirectorRuntimePolicySnapshot["modelTier"];
}
