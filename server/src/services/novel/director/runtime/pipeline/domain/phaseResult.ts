import { type DirectorCharacterSetupPhaseResult } from "../../../phases/novelDirectorPipelinePhases";

export function isDirectorCharacterSetupPauseResult(value: unknown): value is Extract<
  DirectorCharacterSetupPhaseResult,
  { status: "waiting_review" | "applied_waiting_review" }
> {
  if (!value || typeof value !== "object") {
    return false;
  }
  const status = (value as { status?: unknown }).status;
  return status === "waiting_review" || status === "applied_waiting_review";
}
