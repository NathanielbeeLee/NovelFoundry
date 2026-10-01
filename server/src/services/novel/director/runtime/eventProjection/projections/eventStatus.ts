import type { DirectorEvent, DirectorRuntimeProjectionStatus, DirectorTaskFactSummary, DirectorStepRun } from "@novelfoundry/shared/types/directorRuntime";

export function timestampOf(value?: string | null): number {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function latestStep(steps: DirectorStepRun[]): DirectorStepRun | null {
  return steps.reduce<DirectorStepRun | null>((latest, step) => {
    if (!latest) {
      return step;
    }
    const stepTime = Math.max(timestampOf(step.finishedAt), timestampOf(step.startedAt));
    const latestTime = Math.max(timestampOf(latest.finishedAt), timestampOf(latest.startedAt));
    return stepTime >= latestTime ? step : latest;
  }, null);
}

export function latestEvent(events: DirectorEvent[]): DirectorEvent | null {
  return events.reduce<DirectorEvent | null>((latest, event) => {
    if (!latest) {
      return event;
    }
    return timestampOf(event.occurredAt) >= timestampOf(latest.occurredAt) ? event : latest;
  }, null);
}

export function statusFromStep(
  step: DirectorStepRun | null,
  factSummary?: DirectorTaskFactSummary | null,
): DirectorRuntimeProjectionStatus {
  if (!step) {
    return factSummary?.allStepsCompleted ? "completed" : "idle";
  }
  if (step.status === "waiting_approval") {
    return "waiting_approval";
  }
  if (step.status === "blocked_scope") {
    return "blocked";
  }
  if (step.status === "failed") {
    return "failed";
  }
  if (step.status === "running") {
    return "running";
  }
  if (!factSummary) {
    return "completed";
  }
  return factSummary.allStepsCompleted ? "completed" : "idle";
}

export function resolveBlockedReason(step: DirectorStepRun | null, event: DirectorEvent | null): string | null {
  if (!step) {
    return null;
  }
  if (step.status === "waiting_approval" || step.status === "blocked_scope") {
    return step.policyDecision?.reason ?? event?.summary ?? step.error ?? null;
  }
  if (step.status === "failed") {
    return step.error ?? event?.summary ?? null;
  }
  return null;
}
