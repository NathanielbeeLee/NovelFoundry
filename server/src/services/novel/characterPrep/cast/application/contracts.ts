import type { CharacterWorldFocusHints } from "@novelfoundry/shared/types/novel";

import type { LLMProvider } from "@novelfoundry/shared/types/llm";

import { type CharacterVisibleProfileGenerateOptions } from "../../../characterProfile/CharacterVisibleProfileService";

export interface CharacterPrepOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  storyInput?: string;
  useWorldContext?: boolean;
  worldFocusHints?: CharacterWorldFocusHints;
}

export interface CharacterCastApplyOptions {
  overrideQualityGate?: boolean;
  visibleProfileGeneration?: CharacterVisibleProfileGenerateOptions;
  postApplyMode?: "sync" | "background" | "deferred";
}
