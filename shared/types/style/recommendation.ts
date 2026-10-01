import type { LLMProvider } from "../llm";

export interface StyleGenerationLlmConfig {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export interface StyleRecommendationCandidate {
  styleProfileId: string;
  styleProfileName: string;
  styleProfileDescription?: string | null;
  fitScore: number;
  recommendationReason: string;
  caution?: string | null;
}

export interface StyleRecommendationResult {
  novelId: string;
  summary: string;
  candidates: StyleRecommendationCandidate[];
  recommendedAt: string;
}
