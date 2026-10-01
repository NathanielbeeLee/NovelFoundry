import type { TaskStatus, TaskTokenUsageSummary } from "../task";
import type { NovelWorkflowCheckpoint, BookContract } from "../novelWorkflow";
import type { NarrativeForm } from "../creationStudio";
import type { WritingPlatform } from "../writingPlatform";
import type { BookAnalysisSectionKey } from "../bookAnalysis";
import type { VolumePlan } from "./planning/volumes.js";

export type NovelStatus = "draft" | "published";

export type NovelWritingMode = "original" | "continuation";

export type ProjectMode = "ai_led" | "co_pilot" | "draft_mode" | "auto_pipeline";

export type CreationExperience = "simple" | "professional";

export type NarrativePov = "first_person" | "third_person" | "mixed";

export type PacePreference = "slow" | "balanced" | "fast";

export type EmotionIntensity = "low" | "medium" | "high";

export type AIFreedom = "low" | "medium" | "high";

export type ProjectProgressStatus = "not_started" | "in_progress" | "completed" | "rework" | "blocked";

export interface NovelAutoDirectorTaskSummary {
  id: string;
  status: TaskStatus;
  pendingManualRecovery?: boolean;
  progress: number;
  currentStage?: string | null;
  currentItemLabel?: string | null;
  executionScopeLabel?: string | null;
  displayStatus?: string | null;
  blockingReason?: string | null;
  resumeAction?: string | null;
  lastHealthyStage?: string | null;
  checkpointType?: NovelWorkflowCheckpoint | null;
  checkpointSummary?: string | null;
  nextActionLabel?: string | null;
  updatedAt: string;
}

export interface Novel {
  id: string;
  title: string;
  description?: string | null;
  targetAudience?: string | null;
  bookSellingPoint?: string | null;
  competingFeel?: string | null;
  first30ChapterPromise?: string | null;
  commercialTags: string[];
  status: NovelStatus;
  writingMode: NovelWritingMode;
  projectMode?: ProjectMode | null;
  creationExperience: CreationExperience;
  narrativeForm: NarrativeForm;
  targetWordCount?: number | null;
  derivedFromNovelId?: string | null;
  writingPlatform?: WritingPlatform | null;
  writingPlatformProfileVersion?: number | null;
  narrativePov?: NarrativePov | null;
  pacePreference?: PacePreference | null;
  styleTone?: string | null;
  emotionIntensity?: EmotionIntensity | null;
  aiFreedom?: AIFreedom | null;
  postGenerationStyleReviewEnabled: boolean;
  defaultChapterLength?: number | null;
  estimatedChapterCount?: number | null;
  projectStatus?: ProjectProgressStatus | null;
  storylineStatus?: ProjectProgressStatus | null;
  outlineStatus?: ProjectProgressStatus | null;
  resourceReadyScore?: number | null;
  sourceNovelId?: string | null;
  sourceKnowledgeDocumentId?: string | null;
  continuationBookAnalysisId?: string | null;
  continuationBookAnalysisSections?: BookAnalysisSectionKey[] | null;
  outline?: string | null;
  structuredOutline?: string | null;
  volumes?: VolumePlan[];
  volumeSource?: "volume" | "legacy" | "empty";
  activeVolumeVersionId?: string | null;
  bookContract?: BookContract | null;
  genreId?: string | null;
  primaryStoryModeId?: string | null;
  secondaryStoryModeId?: string | null;
  worldId?: string | null;
  tokenUsage?: TaskTokenUsageSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface NovelGenre {
  id: string;
  name: string;
  description?: string | null;
  template?: string | null;
  parentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TitleSuggestion {
  title: string;
  clickRate: number;
  style: "literary" | "conflict";
}
