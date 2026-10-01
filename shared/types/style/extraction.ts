import type { StyleRulePatch } from "./rules.js";

export type StyleSourceType =
  | "manual"
  | "from_text"
  | "from_book_analysis"
  | "from_knowledge_document"
  | "from_current_work";

export type StyleExtractionSourceProcessingMode = "full_text" | "representative_sample";

export type StyleExtractionFeatureGroup = "narrative" | "language" | "dialogue" | "rhythm" | "fingerprint";

export type StyleFeatureDecision = "keep" | "weaken" | "remove";

export interface StyleExtractionFeature {
  id: string;
  group: StyleExtractionFeatureGroup;
  label: string;
  description: string;
  evidence: string;
  importance: number;
  imitationValue: number;
  transferability: number;
  fingerprintRisk: number;
  keepRulePatch: StyleRulePatch;
  weakenRulePatch?: StyleRulePatch;
}

export interface StyleProfileFeature extends StyleExtractionFeature {
  enabled: boolean;
  selectedDecision?: StyleFeatureDecision;
}

export interface StyleExtractionPresetDecision {
  featureId: string;
  decision: StyleFeatureDecision;
}

export interface StyleExtractionPreset {
  key: "imitate" | "balanced" | "transfer";
  label: string;
  summary: string;
  decisions: StyleExtractionPresetDecision[];
}

export interface StyleExtractionDraft {
  name: string;
  description?: string | null;
  category?: string | null;
  tags: string[];
  applicableGenres: string[];
  analysisMarkdown?: string | null;
  summary: string;
  features: StyleExtractionFeature[];
  presets: StyleExtractionPreset[];
  antiAiRuleKeys: string[];
}
