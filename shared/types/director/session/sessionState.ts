import type { DirectorRunMode } from "./modes.js";

export const DIRECTOR_LOCK_SCOPES = [
  "basic",
  "story_macro",
  "world",
  "character",
  "outline",
  "structured",
  "chapter",
  "pipeline",
] as const;

export type DirectorLockScope = typeof DIRECTOR_LOCK_SCOPES[number];

export interface DirectorSessionState {
  runMode: DirectorRunMode;
  isBackgroundRunning: boolean;
  lockedScopes: DirectorLockScope[];
  phase:
    | "candidate_selection"
    | "story_macro"
    | "world_setup"
    | "character_setup"
    | "volume_strategy"
    | "structured_outline"
    | "chapter_execution";
  reviewScope?: DirectorLockScope | null;
}
