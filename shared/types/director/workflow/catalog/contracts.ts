import type { NovelWorkflowResumeTarget, NovelWorkflowMilestoneType, NovelWorkflowStage, NovelWorkflowCheckpoint } from "../workflow";

export type WorkflowStepCatalogDisplayStage =
  | "project_setup"
  | "story_planning"
  | "world_setup"
  | "character_setup"
  | "volume_strategy"
  | "structured_outline"
  | "chapter_execution"
  | "quality_repair";

export type WorkflowStepCatalogTab = NonNullable<NovelWorkflowResumeTarget["stage"]> | "history";

export type WorkflowStepCatalogTargetType = "novel" | "volume" | "chapter" | "global";

export type WorkflowStepCatalogPolicyAction =
  | "analyze"
  | "run_node"
  | "repair"
  | "overwrite"
  | "auto_continue";

export type WorkflowStepCatalogApprovalPoint =
  | "candidate_direction_confirmed"
  | "character_setup_ready"
  | "volume_strategy_ready"
  | "structured_outline_ready"
  | "chapter_execution_continue"
  | "low_risk_quality_repair_continue"
  | "replan_continue"
  | "rewrite_cleanup_confirmed";

export interface WorkflowStepCatalogAliases {
  nodeKeys?: readonly string[];
  currentItemKeys?: readonly string[];
  checkpoints?: readonly NovelWorkflowMilestoneType[];
  currentStages?: readonly string[];
}

export interface WorkflowStepCatalogEntry {
  id: string;
  stage: string;
  displayStage: WorkflowStepCatalogDisplayStage;
  workflowStage: NovelWorkflowStage;
  tab: WorkflowStepCatalogTab;
  checkpoint: NovelWorkflowCheckpoint | null;
  approvalPoint: WorkflowStepCatalogApprovalPoint | null;
  defaultProgress: number;
  nodeKey: string;
  label: string;
  targetType: WorkflowStepCatalogTargetType;
  reads: readonly string[];
  writes: readonly string[];
  mayModifyUserContent: boolean;
  requiresApprovalByDefault: boolean;
  supportsAutoRetry: boolean;
  orchestrationOrder?: number;
  prerequisiteStepIds?: readonly string[];
  policyAction?: WorkflowStepCatalogPolicyAction;
  aliases?: WorkflowStepCatalogAliases;
}

export interface WorkflowCheckpointCatalogEntry {
  checkpoint: NovelWorkflowMilestoneType;
  displayStage: WorkflowStepCatalogDisplayStage;
  workflowStage: NovelWorkflowStage;
  tab: WorkflowStepCatalogTab;
  label: string;
  runningLabel?: string;
  pausedLabel?: string;
  waitingApprovalLabel?: string;
  approvalPoint: WorkflowStepCatalogApprovalPoint | null;
  defaultProgress: number;
}
