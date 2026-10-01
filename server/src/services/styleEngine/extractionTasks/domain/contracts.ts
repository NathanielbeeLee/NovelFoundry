import type { LLMProvider } from "@novelfoundry/shared/types/llm";

import type { StyleExtractionSourceProcessingMode } from "@novelfoundry/shared/types/styleEngine";

import { type StyleExtractionTaskSourceType } from "../../StyleExtractionSourceInput";

export type PresetKey = "imitate" | "balanced" | "transfer";

export interface CreateStyleExtractionTaskInput {
  name: string;
  sourceText: string;
  sourceType?: StyleExtractionTaskSourceType;
  sourceRefId?: string;
  sourceProcessingMode?: StyleExtractionSourceProcessingMode;
  category?: string;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  presetKey?: PresetKey;
  maxRetries?: number;
}
