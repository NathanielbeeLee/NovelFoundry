export interface StyleDetectionPromptInput {
  styleContractText: string;
  styleContractMetaText: string;
  antiRuleCatalogText: string;
  content: string;
}

export interface StyleRecommendationPromptInput {
  targetCount: number;
  novelSummary: string;
  catalogText: string;
  allowedProfileIds: string[];
}

export interface StyleGenerationPromptInput {
  styleContractText?: string;
  styleBlock: string;
  characterBlock: string;
  antiAiBlock: string;
  selfCheckBlock: string;
  mode: "generate" | "rewrite";
  prompt: string;
  targetLength: number;
}

export interface StyleRewritePromptInput {
  styleContractText: string;
  content: string;
  issuesBlock: string;
}

export interface StyleProfileExtractionPromptInput {
  name: string;
  category?: string;
  sourceText: string;
  retryForFeatures?: boolean;
}

export interface StyleProfileFromBookAnalysisPromptInput {
  analysisTitle: string;
  name: string;
  sourceText: string;
}

export interface StyleProfileFromBriefPromptInput {
  brief: string;
  name?: string;
  category?: string;
}

export interface StyleProfileMetadataPromptInput {
  name: string;
  sourceType: "from_text" | "from_brief" | "from_book_analysis";
  preferredCategory?: string;
  styleDigest: string;
}

export interface StyleProfileAntiAiSelectionPromptInput {
  name: string;
  summary?: string;
  styleDigest: string;
  riskDigest: string;
  catalogText: string;
  maxRuleCount?: number;
}

export interface StyleProfileSanitizeForGenerationPromptInput {
  profileName: string;
  styleContractText: string;
  sourceDigest: string;
}

export interface AntiAiRuleAiDraftPromptInput {
  mode: "create" | "improve";
  instruction: string;
  currentRuleText?: string;
}
