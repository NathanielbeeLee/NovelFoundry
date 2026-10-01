import type { DirectorTakeoverEntryStep, DirectorTakeoverStartPhase } from "@novelfoundry/shared/types/novelDirector";
import type { NovelWorkflowStage } from "@novelfoundry/shared/types/novelWorkflow";
import { DIRECTOR_TAKEOVER_ENTRY_STEPS } from "@novelfoundry/shared/types/novelDirector";

const TAKEOVER_PHASE_TO_ENTRY_STEP: Record<DirectorTakeoverStartPhase, DirectorTakeoverEntryStep> = {
  story_macro: "story_macro",
  world_setup: "world",
  character_setup: "character",
  volume_strategy: "outline",
  structured_outline: "structured",
};

const TAKEOVER_ENTRY_STEP_TO_LEGACY_START_PHASE: Record<DirectorTakeoverEntryStep, DirectorTakeoverStartPhase> = {
  basic: "story_macro",
  story_macro: "story_macro",
  world: "world_setup",
  character: "character_setup",
  outline: "volume_strategy",
  structured: "structured_outline",
  chapter: "structured_outline",
  pipeline: "structured_outline",
};

const TAKEOVER_ENTRY_STEP_TO_WORKFLOW_STAGE: Record<DirectorTakeoverEntryStep, NovelWorkflowStage> = {
  basic: "story_macro",
  story_macro: "story_macro",
  world: "world_setup",
  character: "character_setup",
  outline: "volume_strategy",
  structured: "structured_outline",
  chapter: "chapter_execution",
  pipeline: "quality_repair",
};

export function phaseToEntryStep(phase: DirectorTakeoverStartPhase): DirectorTakeoverEntryStep {
  return TAKEOVER_PHASE_TO_ENTRY_STEP[phase];
}

export function entryStepToLegacyStartPhase(step: DirectorTakeoverEntryStep): DirectorTakeoverStartPhase {
  return TAKEOVER_ENTRY_STEP_TO_LEGACY_START_PHASE[step];
}

export function entryStepToWorkflowStage(step: DirectorTakeoverEntryStep): NovelWorkflowStage {
  return TAKEOVER_ENTRY_STEP_TO_WORKFLOW_STAGE[step];
}

export function buildSkipSteps(from: DirectorTakeoverEntryStep, to: DirectorTakeoverEntryStep): DirectorTakeoverEntryStep[] {
  const fromIndex = DIRECTOR_TAKEOVER_ENTRY_STEPS.indexOf(from);
  const toIndex = DIRECTOR_TAKEOVER_ENTRY_STEPS.indexOf(to);
  if (fromIndex < 0 || toIndex < 0 || toIndex <= fromIndex) {
    return [];
  }
  return DIRECTOR_TAKEOVER_ENTRY_STEPS.slice(fromIndex, toIndex);
}
