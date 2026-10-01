import type { StyleExtractionPreset } from "@novelfoundry/shared/types/styleEngine";

import { type StyleCreationCoreDraft } from "../../styleCreation";

export const AI_STYLE_BRIEF_SOURCE_PREFIX = "ai-style-brief:";

export const STYLE_EXTRACTION_MAX_TOKENS = 4096;

export const STYLE_METADATA_MAX_TOKENS = 600;

export const STYLE_ANTI_AI_SELECTION_MAX_TOKENS = 500;

export const DEFAULT_EXTRACTION_PRESET_KEY: StyleExtractionPreset["key"] = "balanced";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeRuleRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function countExtractionFeatures(value: unknown): number {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return 0;
  }
  const record = value as Record<string, unknown>;
  const candidates = [record.features, record.extractedFeatures, record.featurePool];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.length;
    }
  }
  return 0;
}

export function buildGeneratedCoreDraftSummary(input: {
  name: string;
  description?: string | null;
  analysisMarkdown?: string | null;
  narrativeRules?: Record<string, unknown>;
  characterRules?: Record<string, unknown>;
  languageRules?: Record<string, unknown>;
  rhythmRules?: Record<string, unknown>;
}): StyleCreationCoreDraft {
  return {
    name: input.name,
    description: input.description,
    analysisMarkdown: input.analysisMarkdown,
    ruleSet: {
      narrativeRules: input.narrativeRules ?? {},
      characterRules: input.characterRules ?? {},
      languageRules: input.languageRules ?? {},
      rhythmRules: input.rhythmRules ?? {},
    },
  };
}
