import type { LLMProvider } from "../llm";

export interface NovelRouteForecastRequest {
  candidateCount?: number;
  horizon?: number;
  authorIntent?: string;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export interface NovelRouteForecastBeat {
  chapterOffset: number;
  objective: string;
  conflict: string;
  turningPoint: string;
  hook: string;
}

export interface NovelRouteForecastCharacterChoice {
  character: string;
  choice: string;
  consequence: string;
}

export interface NovelRouteForecastRisk {
  level: "low" | "medium" | "high";
  summary: string;
  mitigation: string;
}

export interface NovelRouteForecastCandidate {
  id: string;
  title: string;
  coreMove: string;
  chapterBeats: NovelRouteForecastBeat[];
  characterChoices: NovelRouteForecastCharacterChoice[];
  expectedChanges: string[];
  readerPayoff: string;
  fitScore: number;
  noveltyScore: number;
  continuityScore: number;
  fitReason: string;
  risks: NovelRouteForecastRisk[];
}

export interface NovelRouteForecast {
  novelId: string;
  chapterId: string;
  chapterOrder: number;
  horizon: number;
  recommendedRouteId: string;
  comparisonSummary: string;
  routes: NovelRouteForecastCandidate[];
  generatedAt: string;
  sourceFingerprint: string;
}
