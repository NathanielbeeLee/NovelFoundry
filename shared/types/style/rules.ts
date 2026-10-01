export type StyleBindingTargetType = "novel" | "chapter" | "task";

export interface NarrativeRules {
  progressionMode?: string | null;
  sceneUnitPattern?: string[];
  multiPov?: boolean | null;
  looping?: boolean | null;
  endingStyle?: string | null;
  povSwitchStyle?: string | null;
  summary?: string | null;
  [key: string]: unknown;
}

export interface CharacterRules {
  allowSelfReflection?: boolean | null;
  emotionExpression?: string | null;
  defenseMechanisms?: string[];
  facePriority?: boolean | null;
  dialogueStyle?: string | null;
  summary?: string | null;
  [key: string]: unknown;
}

export interface LanguageRules {
  register?: string | null;
  roughness?: number | null;
  allowIncompleteSentences?: boolean | null;
  allowSwearing?: boolean | null;
  sentenceVariation?: string | null;
  allowUselessDetails?: boolean | null;
  summary?: string | null;
  [key: string]: unknown;
}

export interface RhythmRules {
  pace?: string | null;
  paragraphDensity?: string | null;
  allowFragmentedFlow?: boolean | null;
  actionOverExplanation?: boolean | null;
  summary?: string | null;
  [key: string]: unknown;
}

export interface StyleRuleSet {
  narrativeRules: NarrativeRules;
  characterRules: CharacterRules;
  languageRules: LanguageRules;
  rhythmRules: RhythmRules;
}

export type StyleContractSectionKey =
  | "narrative"
  | "character"
  | "language"
  | "rhythm"
  | "antiAi"
  | "selfCheck";

export type StyleContractMaturity = "structured" | "summary_only";

export type StyleContractIssueCategory = "style_expression" | "story_structure";

export type StyleContractViolationSource = "global_anti_ai" | "style_anti_ai" | "style_contract";

export interface StyleContractSection {
  key: StyleContractSectionKey;
  title: string;
  summary?: string | null;
  lines: string[];
  text: string;
  hasContent: boolean;
}

export interface StyleContractMeta {
  effectiveStyleProfileId?: string | null;
  taskStyleProfileId?: string | null;
  activeSourceTargets: StyleBindingTargetType[];
  activeSourceLabels: string[];
  writerIncludedSections: StyleContractSectionKey[];
  plannerIncludedSections: StyleContractSectionKey[];
  droppedSections: StyleContractSectionKey[];
  maturity: StyleContractMaturity;
  usesGlobalAntiAiBaseline: boolean;
  globalAntiAiRuleIds: string[];
  styleAntiAiRuleIds: string[];
}

export interface StyleContract {
  narrative: StyleContractSection;
  character: StyleContractSection;
  language: StyleContractSection;
  rhythm: StyleContractSection;
  antiAi: StyleContractSection;
  selfCheck: StyleContractSection;
  meta: StyleContractMeta;
}

export interface StyleRulePatch {
  narrativeRules?: NarrativeRules;
  characterRules?: CharacterRules;
  languageRules?: LanguageRules;
  rhythmRules?: RhythmRules;
}

export const STYLE_ENGINE_COMPATIBILITY_FIELDS = {
  narrativeRules: [
    "progressionMode",
    "sceneUnitPattern",
    "multiPov",
    "looping",
    "endingStyle",
  ],
  characterRules: [],
  languageRules: [],
  rhythmRules: [],
} as const satisfies Record<keyof StyleRuleSet, readonly string[]>;

export type StyleRuleSectionKey = keyof StyleRuleSet;

export function isStyleCompatibilityField(
  section: StyleRuleSectionKey,
  key: string,
): boolean {
  return (STYLE_ENGINE_COMPATIBILITY_FIELDS[section] as readonly string[]).includes(key);
}
