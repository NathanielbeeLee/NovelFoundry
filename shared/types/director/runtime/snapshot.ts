import type { DirectorRuntimeProjection } from "./projections/runtimeProjection.js";
import type { DirectorRuntimePolicySnapshot } from "./policy.js";
import type { DirectorStepRun } from "./facts.js";
import type { DirectorEvent } from "./events.js";
import type { DirectorArtifactRef } from "./artifacts.js";
import type { DirectorWorkspaceAnalysis } from "./workspace.js";

export interface DirectorRuntimePolicyUpdateResponse {
  snapshot: DirectorRuntimeSnapshot | null;
}

export interface DirectorRuntimeSnapshotResponse {
  snapshot: DirectorRuntimeSnapshot | null;
  projection?: DirectorRuntimeProjection | null;
}

export interface DirectorRuntimeSnapshot {
  schemaVersion: 1;
  runId: string;
  novelId?: string | null;
  entrypoint?: string | null;
  policy: DirectorRuntimePolicySnapshot;
  steps: DirectorStepRun[];
  events: DirectorEvent[];
  artifacts: DirectorArtifactRef[];
  lastWorkspaceAnalysis?: DirectorWorkspaceAnalysis | null;
  updatedAt: string;
}
