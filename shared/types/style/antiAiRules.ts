import type { StyleBindingTargetType } from "./rules.js";

export type AntiAiRuleType = "forbidden" | "risk" | "encourage";

export type AntiAiSeverity = "low" | "medium" | "high";

export interface AntiAiRule {
  id: string;
  key: string;
  name: string;
  type: AntiAiRuleType;
  severity: AntiAiSeverity;
  description: string;
  detectPatterns: string[];
  rewriteSuggestion?: string | null;
  promptInstruction?: string | null;
  autoRewrite: boolean;
  enabled: boolean;
  globalBaselineEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AntiAiRuleSourceType = "global_baseline" | "style_profile";

export interface AntiAiEffectiveRuleItem {
  rule: AntiAiRule;
  source: AntiAiRuleSourceType;
  sourceLabel: string;
  styleProfileId?: string | null;
  styleProfileName?: string | null;
  bindingTargetType?: StyleBindingTargetType | null;
  bindingTargetId?: string | null;
  weight: number;
}

export interface AntiAiEffectiveRulesResult {
  globalBaselineRules: AntiAiEffectiveRuleItem[];
  styleSpecificRules: AntiAiEffectiveRuleItem[];
  effectiveRules: AntiAiEffectiveRuleItem[];
  effectiveStyleProfileId?: string | null;
  usesGlobalAntiAiBaseline: boolean;
}

export interface AntiAiRuleDraftFields {
  key: string;
  name: string;
  type: AntiAiRuleType;
  severity: AntiAiSeverity;
  description: string;
  detectPatterns: string[];
  promptInstruction?: string | null;
  rewriteSuggestion?: string | null;
  enabled: boolean;
  globalBaselineEnabled: boolean;
  autoRewrite: boolean;
}

export interface AntiAiRuleAiDraftRequest {
  mode: "create" | "improve";
  instruction: string;
  currentRule?: AntiAiRuleDraftFields;
}

export interface AntiAiRuleAiDraftResult {
  draft: AntiAiRuleDraftFields;
  rationale: string;
  safetyNotes: string[];
}
