export type PipelineRunMode = "fast" | "polish";

export type ArtifactSyncMode = "adaptive" | "deferred" | "strict";

export type PipelineRepairMode =
  | "detect_only"
  | "light_repair"
  | "heavy_repair"
  | "continuity_only"
  | "character_only"
  | "ending_only";

export type PipelineJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface PipelineJob {
  id: string;
  novelId: string;
  startOrder: number;
  endOrder: number;
  runMode?: PipelineRunMode | null;
  autoReview?: boolean | null;
  autoRepair?: boolean | null;
  skipCompleted?: boolean | null;
  qualityThreshold?: number | null;
  repairMode?: PipelineRepairMode | null;
  artifactSyncMode?: ArtifactSyncMode | null;
  status: PipelineJobStatus;
  progress: number;
  completedCount: number;
  totalCount: number;
  retryCount: number;
  maxRetries: number;
  heartbeatAt?: string | null;
  currentStage?: string | null;
  currentItemKey?: string | null;
  currentItemLabel?: string | null;
  cancelRequestedAt?: string | null;
  displayStatus?: string | null;
  noticeCode?: string | null;
  noticeSummary?: string | null;
  qualityAlertDetails?: string[];
  error?: string | null;
  lastErrorType?: string | null;
  payload?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
