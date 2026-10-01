import type { LLMProvider } from "../../llm";
import type { DirectorRunMode } from "./modes.js";
import type { ProjectMode, NarrativePov, PacePreference, EmotionIntensity, AIFreedom, ProjectProgressStatus } from "../../novel";
import type { WritingPlatformPreference } from "../../writingPlatform";
import type { StyleIntentSummary } from "../../styleEngine";
import type { BookAnalysisSectionKey } from "../../bookAnalysis";

export interface DirectorLLMOptions {
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  runMode?: DirectorRunMode;
}

export interface DirectorProjectContextInput {
  title?: string;
  description?: string;
  targetAudience?: string;
  bookSellingPoint?: string;
  competingFeel?: string;
  first30ChapterPromise?: string;
  commercialTags?: string[];
  genreId?: string;
  primaryStoryModeId?: string;
  secondaryStoryModeId?: string;
  productionFoundationPrompt?: string;
  worldId?: string;
  worldSetupMode?: "auto_generate" | "skip";
  writingMode?: "original" | "continuation";
  projectMode?: ProjectMode;
  readerChannelPreference?: "ai_judge" | "male_oriented" | "female_oriented" | "general";
  writingPlatformPreference?: WritingPlatformPreference;
  narrativePov?: NarrativePov;
  pacePreference?: PacePreference;
  styleTone?: string;
  styleProfileId?: string;
  styleIntentSummary?: StyleIntentSummary;
  emotionIntensity?: EmotionIntensity;
  aiFreedom?: AIFreedom;
  postGenerationStyleReviewEnabled?: boolean;
  defaultChapterLength?: number;
  estimatedChapterCount?: number;
  projectStatus?: ProjectProgressStatus;
  storylineStatus?: ProjectProgressStatus;
  outlineStatus?: ProjectProgressStatus;
  resourceReadyScore?: number;
  sourceNovelId?: string;
  sourceKnowledgeDocumentId?: string;
  continuationBookAnalysisId?: string;
  continuationBookAnalysisSections?: BookAnalysisSectionKey[];
}

export type DirectorWorldSetupMode = NonNullable<DirectorProjectContextInput["worldSetupMode"]>;
