import type { StyleSourceType, StyleProfileFeature, StyleExtractionPreset } from "./extraction.js";
import type { NarrativeRules, CharacterRules, LanguageRules, RhythmRules } from "./rules.js";
import type { AntiAiRule } from "./antiAiRules.js";

export type StyleProfileStatus = "active" | "archived";

export interface StyleProfile {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  tags: string[];
  applicableGenres: string[];
  sourceType: StyleSourceType;
  sourceRefId?: string | null;
  sourceContent?: string | null;
  analysisMarkdown?: string | null;
  status: StyleProfileStatus;
  extractedFeatures: StyleProfileFeature[];
  extractionPresets: StyleExtractionPreset[];
  extractionAntiAiRuleKeys: string[];
  selectedExtractionPresetKey?: StyleExtractionPreset["key"] | null;
  narrativeRules: NarrativeRules;
  characterRules: CharacterRules;
  languageRules: LanguageRules;
  rhythmRules: RhythmRules;
  antiAiRules: AntiAiRule[];
  createdAt: string;
  updatedAt: string;
}

export interface StyleTemplate {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  applicableGenres: string[];
  analysisMarkdown?: string | null;
  narrativeRules: NarrativeRules;
  characterRules: CharacterRules;
  languageRules: LanguageRules;
  rhythmRules: RhythmRules;
  defaultAntiAiRuleKeys: string[];
  createdAt: string;
  updatedAt: string;
}
