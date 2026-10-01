import type { StyleBindingTargetType, StyleContract, StyleRuleSet, StyleContractMaturity } from "./rules.js";
import type { StyleProfile } from "./profile.js";

export interface StyleBinding {
  id: string;
  styleProfileId: string;
  targetType: StyleBindingTargetType;
  targetId: string;
  priority: number;
  weight: number;
  enabled: boolean;
  styleProfile?: StyleProfile;
  createdAt: string;
  updatedAt: string;
}

export interface CompiledStylePromptBlocks {
  context: string;
  style: string;
  character: string;
  antiAi: string;
  output: string;
  selfCheck: string;
  contract: StyleContract;
  mergedRules: StyleRuleSet;
  appliedRuleIds: string[];
}

export interface ResolvedStyleContext {
  matchedBindings: StyleBinding[];
  compiledBlocks: CompiledStylePromptBlocks | null;
  effectiveStyleProfileId: string | null;
  taskStyleProfileId: string | null;
  activeSourceTargets: StyleBindingTargetType[];
  activeSourceLabels: string[];
  maturity: StyleContractMaturity;
  usesGlobalAntiAiBaseline: boolean;
  globalAntiAiRuleIds: string[];
  styleAntiAiRuleIds: string[];
  sanitizedGenerationProfile?: StyleSanitizedGenerationProfile | null;
}

export interface StyleSanitizedGenerationProfile {
  writingGuidance: string[];
  forbiddenEntities: string[];
  sourceProfileNames: string[];
  sanitizedAt: string;
  strategy: "deterministic" | "llm";
}
