export const DIRECTOR_RUN_MODES = [
  "full_book_autopilot",
  "auto_to_ready",
  "auto_to_execution",
  "stage_review",
] as const;

export type DirectorRunMode = typeof DIRECTOR_RUN_MODES[number];

export const DIRECTOR_AUTO_EXECUTION_RUN_MODES = [
  "auto_to_execution",
  "full_book_autopilot",
] as const;

export type DirectorAutoExecutionRunMode = typeof DIRECTOR_AUTO_EXECUTION_RUN_MODES[number];

export const DIRECTOR_FULL_BOOK_AUTOPILOT_RUN_MODE = "full_book_autopilot" as const;

export const DIRECTOR_FULL_BOOK_AUTOPILOT_INTERRUPT_REASONS = [
  "model_unavailable",
  "service_unavailable",
  "protected_user_content",
  "unrecoverable_data_risk",
  "auto_repair_exhausted",
] as const;

export type DirectorFullBookAutopilotInterruptReason = typeof DIRECTOR_FULL_BOOK_AUTOPILOT_INTERRUPT_REASONS[number];
