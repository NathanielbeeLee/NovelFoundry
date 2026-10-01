import type { DirectorRunCommandType } from "./commands.js";

export type DirectorWorkerDerivedState =
  | "idle"
  | "queued_waiting_worker"
  | "leased_starting"
  | "running_step"
  | "waiting_gate"
  | "auto_recovering"
  | "cancelled"
  | "failed_recoverable"
  | "failed_hard"
  | "succeeded";

export type DirectorWorkerNextAction =
  | "none"
  | "wait_for_worker"
  | "wait_for_lease_start"
  | "continue_running"
  | "recover_stale_command"
  | "requires_user_action";

export interface DirectorWorkerHealthSummary {
  derivedState: DirectorWorkerDerivedState;
  message?: string | null;
  queuedCommandCount: number;
  leasedCommandCount: number;
  runningCommandCount: number;
  staleCommandCount: number;
  oldestQueuedAt?: string | null;
  oldestQueuedWaitMs?: number | null;
  currentCommandId?: string | null;
  currentCommandType?: DirectorRunCommandType | string | null;
  currentWorkerId?: string | null;
  currentSlotId?: string | null;
  currentExecutionId?: string | null;
  currentExecutionStatus?: string | null;
  currentLeaseExpiresAt?: string | null;
  blockedReason?: string | null;
  lastErrorMessage?: string | null;
  nextAction?: DirectorWorkerNextAction;
  lastCommandAt?: string | null;
}
