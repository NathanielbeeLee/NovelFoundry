import type { DirectorArtifactType } from "./artifacts.js";

export type DirectorEventType =
  | "run_started"
  | "run_resumed"
  | "node_started"
  | "node_heartbeat"
  | "node_completed"
  | "node_failed"
  | "artifact_indexed"
  | "workspace_analyzed"
  | "run_cancelled"
  | "policy_changed"
  | "approval_required"
  | "quality_issue_found"
  | "quality_loop_assessed"
  | "repair_ticket_created"
  | "replan_run_created"
  | "pending_review_auto_promotion"
  | "circuit_breaker_opened"
  | "circuit_breaker_reset"
  | "token_budget_warning"
  | "token_budget_exhausted"
  | "continue_with_risk";

export interface DirectorEvent {
  eventId: string;
  type: DirectorEventType;
  taskId?: string | null;
  novelId?: string | null;
  nodeKey?: string | null;
  artifactId?: string | null;
  artifactType?: DirectorArtifactType | null;
  summary: string;
  affectedScope?: string | null;
  severity?: "low" | "medium" | "high" | null;
  occurredAt: string;
  metadata?: Record<string, unknown>;
}
