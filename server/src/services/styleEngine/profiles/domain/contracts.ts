import type { LLMProvider } from "@novelfoundry/shared/types/llm";

import type { StyleExtractionPreset, StyleProfileFeature, StyleSourceType } from "@novelfoundry/shared/types/styleEngine";

export interface ManualProfileInput {
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  applicableGenres?: string[];
  sourceType?: StyleSourceType;
  sourceRefId?: string;
  sourceContent?: string;
  extractedFeatures?: StyleProfileFeature[];
  extractionPresets?: StyleExtractionPreset[];
  extractionAntiAiRuleKeys?: string[];
  selectedExtractionPresetKey?: StyleExtractionPreset["key"] | null;
  analysisMarkdown?: string;
  narrativeRules?: Record<string, unknown>;
  characterRules?: Record<string, unknown>;
  languageRules?: Record<string, unknown>;
  rhythmRules?: Record<string, unknown>;
  antiAiRuleIds?: string[];
}

export interface LlmInput {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface GeneratedStyleCorePayload {
  name?: string;
  description?: string | null;
  analysisMarkdown?: string | null;
  narrativeRules?: Record<string, unknown>;
  characterRules?: Record<string, unknown>;
  languageRules?: Record<string, unknown>;
  rhythmRules?: Record<string, unknown>;
}

export interface GeneratedStylePayload extends GeneratedStyleCorePayload {
  category?: string | null;
  tags?: string[];
  applicableGenres?: string[];
  antiAiRuleKeys?: string[];
}

export type TextExtractionSourceType = Extract<StyleSourceType, "from_text" | "from_knowledge_document">;
