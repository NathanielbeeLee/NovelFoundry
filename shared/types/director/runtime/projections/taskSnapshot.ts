import type { DirectorRuntimeSnapshot } from "../snapshot.js";
import type { DirectorRuntimeProjection } from "./runtimeProjection.js";
import type { DirectorEvent } from "../events.js";
import type { DirectorArtifactRef } from "../artifacts.js";
import type { DirectorTaskFactSummary, DirectorChapterExecutionProgressSummary } from "../facts.js";
import type { DirectorDisplayState, DirectorDashboardView } from "./display.js";

export interface DirectorTaskShell {
  id: string;
  novelId?: string | null;
  status: string;
  currentStage?: string | null;
  currentItemKey?: string | null;
  currentItemLabel?: string | null;
  progress?: number | null;
  checkpointType?: string | null;
  checkpointSummary?: string | null;
  lastError?: string | null;
  pendingManualRecovery?: boolean | null;
  cancelRequestedAt?: string | null;
}

export interface DirectorTaskSnapshot {
  task: DirectorTaskShell;
  run: {
    id: string;
    novelId?: string | null;
    entrypoint?: string | null;
  } | null;
  activeStep: {
    idempotencyKey: string;
    nodeKey: string;
    label: string;
    status: string;
  } | null;
  latestCommand: {
    id: string;
    commandType: string;
    status: string;
  } | null;
  runtime: DirectorRuntimeSnapshot | null;
  projection: DirectorRuntimeProjection | null;
  recentEvents: DirectorEvent[];
  artifacts: DirectorArtifactRef[];
  currentFactStepId?: string | null;
  currentFactStepLabel?: string | null;
  currentFactEvidence?: Record<string, unknown> | null;
  factSummary?: DirectorTaskFactSummary | null;
  chapterProgress?: DirectorChapterExecutionProgressSummary | null;
  displayState: DirectorDisplayState;
  dashboardView: DirectorDashboardView;
  nextActions: string[];
}

export interface DirectorTaskSnapshotResponse {
  snapshot: DirectorTaskSnapshot | null;
}
