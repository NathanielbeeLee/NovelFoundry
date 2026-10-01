import type { DirectorLockScope, DirectorRunMode, DirectorSessionState } from "@novelfoundry/shared/types/novelDirector";
import { isDirectorAutoExecutionRunMode } from "@novelfoundry/shared/types/novelDirector";
import { normalizeDirectorRunMode } from "./runMode";

const DIRECTOR_ALL_MUTATING_SCOPES: DirectorLockScope[] = [
  "basic",
  "story_macro",
  "character",
  "outline",
  "structured",
  "chapter",
  "pipeline",
];

export function buildDirectorSessionState(input: {
  runMode?: DirectorRunMode;
  phase: DirectorSessionState["phase"];
  isBackgroundRunning: boolean;
}): DirectorSessionState {
  const runMode = normalizeDirectorRunMode(input.runMode);
  const lockedScopes = resolveDirectorLockedScopes({
    runMode,
    phase: input.phase,
    isBackgroundRunning: input.isBackgroundRunning,
  });
  return {
    runMode,
    phase: input.phase,
    isBackgroundRunning: input.isBackgroundRunning,
    lockedScopes,
    reviewScope: input.isBackgroundRunning ? null : resolveDirectorReviewScope(input.phase),
  };
}

function resolveDirectorLockedScopes(input: {
  runMode: DirectorRunMode;
  phase: DirectorSessionState["phase"];
  isBackgroundRunning: boolean;
}): DirectorLockScope[] {
  if (input.isBackgroundRunning) {
    if (input.phase === "candidate_selection") {
      return ["basic"];
    }
    if (
      input.phase === "story_macro"
      || input.phase === "character_setup"
      || input.phase === "volume_strategy"
      || input.phase === "structured_outline"
    ) {
      return DIRECTOR_ALL_MUTATING_SCOPES;
    }
    if (input.phase === "chapter_execution") {
      if (isDirectorAutoExecutionRunMode(input.runMode)) {
        return ["chapter", "pipeline"];
      }
      return [];
    }
    return DIRECTOR_ALL_MUTATING_SCOPES;
  }

  if (input.runMode === "auto_to_ready") {
    return [];
  }

  if (input.phase === "character_setup") {
    return ["outline", "structured", "chapter", "pipeline"];
  }
  if (input.phase === "volume_strategy") {
    return ["structured", "chapter", "pipeline"];
  }
  if (input.phase === "chapter_execution") {
    return [];
  }
  if (input.phase === "story_macro") {
    return ["character", "outline", "structured", "chapter"];
  }
  return [];
}

function resolveDirectorReviewScope(phase: DirectorSessionState["phase"]): DirectorLockScope | null {
  if (phase === "story_macro") {
    return "story_macro";
  }
  if (phase === "character_setup") {
    return "character";
  }
  if (phase === "volume_strategy") {
    return "outline";
  }
  if (phase === "chapter_execution") {
    return "chapter";
  }
  return null;
}
