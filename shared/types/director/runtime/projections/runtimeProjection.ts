import type { DirectorEventType, DirectorEvent } from "../events.js";
import type { DirectorArtifactType } from "../artifacts.js";
import type { DirectorLlmUsageSummary, DirectorBookTokenBudgetSummary, DirectorLlmUsageRecordSummary, DirectorStepUsageSummary, DirectorPromptUsageSummary } from "../usage.js";
import type { DirectorQualityLoopBudgetNextAction, DirectorCircuitBreakerState } from "../../session/quality";
import type { DirectorStartupPreparation } from "../../session/startup";
import type { DirectorWorkerHealthSummary } from "../workerHealth.js";
import type { DirectorTaskFactSummary, DirectorChapterExecutionProgressSummary } from "../facts.js";
import type { DirectorNextAction } from "../workspace.js";
import type { DirectorPolicyMode } from "../policy.js";

export type DirectorRuntimeProjectionStatus =
  | "idle"
  | "running"
  | "waiting_approval"
  | "blocked"
  | "failed"
  | "completed";

export interface DirectorRuntimeProjectionEvent {
  eventId: string;
  type: DirectorEventType;
  summary: string;
  nodeKey?: string | null;
  artifactType?: DirectorArtifactType | null;
  severity?: DirectorEvent["severity"];
  occurredAt: string;
  usage?: DirectorLlmUsageSummary | null;
}

export type DirectorAutopilotRecoveryDecision =
  | "continue"
  | "auto_repair_chapter"
  | "auto_rewrite_chapter"
  | "auto_replan_window"
  | "auto_resume_from_checkpoint"
  | "defer_and_continue"
  | "requires_manual_recovery";

export interface DirectorRuntimeProgressBreakdown {
  planningProgress: number;
  chapterProgress: number;
  qualityProgress: number;
  activeJobProgress: number;
  planningPercent: number;
  chapterExecutionPercent: number;
  qualityRepairPercent: number;
  totalPercent: number;
  completedSteps: number;
  totalSteps: number;
  draftedChapters: number;
  continuableChapters: number;
  totalChapters: number;
  pendingRepairChapters: number;
  explanation: string;
}

export interface DirectorRuntimeVisibleRiskBadge {
  label: string;
  level: "info" | "warning" | "danger";
  source?: "status" | "artifact" | "event" | "policy";
}

export interface DirectorRuntimeQualityDebtSummary {
  deferredChapterCount: number;
  deferredChapterOrders: number[];
  latestReason?: string | null;
}

export interface DirectorRuntimeQualityBudgetSummary {
  currentChapterId?: string | null;
  currentChapterOrder?: number | null;
  latestSignatureKey?: string | null;
  latestIssueSignature?: string | null;
  latestReason?: string | null;
  patchRepairUsed: number;
  chapterRewriteUsed: number;
  windowReplanUsed: number;
  deferredCount: number;
  nextAction: DirectorQualityLoopBudgetNextAction;
  nextActionLabel: string;
  explanation: string;
}

export interface DirectorRuntimeProjection {
  runId: string;
  novelId?: string | null;
  startupPreparation?: DirectorStartupPreparation | null;
  status: DirectorRuntimeProjectionStatus;
  runtimeId?: string | null;
  runtimeStatus?: string | null;
  currentAction?: string | null;
  waitingReason?: string | null;
  activeExecution?: {
    executionId: string;
    stepType: string;
    resourceClass?: string | null;
    workerId?: string | null;
    slotId?: string | null;
    status: string;
    startedAt?: string | null;
    leaseExpiresAt?: string | null;
  } | null;
  resourceClass?: string | null;
  checkpointSummary?: string | null;
  nextAutomaticAction?: string | null;
  workerHealth?: DirectorWorkerHealthSummary | null;
  currentNodeKey?: string | null;
  currentLabel?: string | null;
  currentFactStepId?: string | null;
  currentFactStepLabel?: string | null;
  currentFactEvidence?: Record<string, unknown> | null;
  factSummary?: DirectorTaskFactSummary | null;
  headline?: string | null;
  detail?: string | null;
  lastEventSummary?: string | null;
  requiresUserAction: boolean;
  blockedReason?: string | null;
  blockingReason?: string | null;
  nextActionLabel?: string | null;
  recommendedAction?: DirectorNextAction | null;
  recoveryDecision?: DirectorAutopilotRecoveryDecision;
  isAutopilotRecoverable?: boolean;
  scopeSummary?: string | null;
  progressSummary?: string | null;
  progressBreakdown?: DirectorRuntimeProgressBreakdown;
  chapterExecutionProgress?: DirectorChapterExecutionProgressSummary | null;
  visibleRiskBadges?: DirectorRuntimeVisibleRiskBadge[];
  rootCauseCode?: "none" | "draft_generation_failed" | "draft_obligation_unmet" | "draft_repair_exhausted" | "replan_required" | null;
  blockingObligations?: Array<{
    kind: "must_hit_now" | "must_preserve" | "payoff_touch" | "character_appearance" | "goal_change" | "forbidden_crossing";
    summary: string;
    evidence?: string | null;
  }>;
  qualityDebtSummary?: DirectorRuntimeQualityDebtSummary | null;
  qualityBudgetSummary?: DirectorRuntimeQualityBudgetSummary | null;
  policyMode: DirectorPolicyMode;
  updatedAt: string;
  recentEvents: DirectorRuntimeProjectionEvent[];
  usageSummary?: DirectorLlmUsageSummary | null;
  tokenBudget?: DirectorBookTokenBudgetSummary | null;
  recentUsage?: DirectorLlmUsageRecordSummary[];
  stepUsage?: DirectorStepUsageSummary[];
  promptUsage?: DirectorPromptUsageSummary[];
  circuitBreaker?: DirectorCircuitBreakerState | null;
}

export interface DirectorRuntimeEventHistoryResponse {
  events: DirectorRuntimeProjectionEvent[];
  totalCount: number;
  limit: number;
}
