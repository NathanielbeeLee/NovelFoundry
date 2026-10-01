// ─── Types ────────────────────────────────────────────────────────────────────

export type ComicSourceType = "novel_import" | "original" | "text_import" | "comic_import";

export interface ComicProject {
  id: string;
  title: string;
  sourceType: ComicSourceType;
  sourceRef?: string | null;
  sourceInput?: string | null;
  trackId?: string | null;
  stylePreset?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  sourceBundle?: { id: string; importedAt: string } | null;
  _count?: { episodes: number; characters: number };
}

export interface ComicProjectDetail extends ComicProject {
  characters: ComicCharacter[];
  episodes: ComicEpisode[];
  batchJobs: ComicBatchJob[];
}

export type ComicCharacterGender = "male" | "female" | "other" | "unknown";

export interface ComicCharacter {
  id: string;
  projectId: string;
  name: string;
  gender?: ComicCharacterGender;
  persona?: string | null;
  visualAnchor?: string | null;
  sheetData?: string | null;
  sourceCharacterRef?: string | null;
  createdAt: string;
}

export interface ComicEpisode {
  id: string;
  projectId: string;
  order: number;
  title: string | null;
  hookType?: string | null;
  cliffhanger?: string | null;
  isPaywalled: boolean;
  outline?: string | null;
  sourceText?: string | null;
  status: string;
  scriptConfig?: string | null; // JSON of script generation settings
  _count?: { panels: number };
  panels?: ComicPanel[];
}

export interface ComicDialogue {
  speaker: string;
  text: string;
  bubbleType: "round" | "spike" | "cloud" | "caption";
  anchorHint?: string;
}

export interface ComicPanelCharacterRef {
  name: string;
  costume?: "default" | "combat" | "formal" | "casual";
  expression?: "neutral" | "happy" | "angry" | "sad" | "surprised" | "cold";
  lighting?: string;
}

export interface ComicPanel {
  id: string;
  episodeId: string;
  order: number;
  panelType: "establishing" | "close_up" | "action" | "reaction" | "transition";
  action: string;
  densityLevel?: "low" | "medium" | "high" | null;
  focus?: string | null;
  dialogues: string | null; // JSON string of ComicDialogue[]
  characterRefs: string | null; // JSON string of string[] or ComicPanelCharacterRef[]
  visualPrompt: string;
  layoutData: string | null; // JSON
  imageData: string | null; // JSON of PanelImageData
  letteredData: string | null; // JSON
  motionData: string | null; // JSON
  createdAt?: string;
  updatedAt?: string;
}

export interface PanelReferenceImageMeta {
  kind: "character_sheet" | "character_expression" | "character_face" | "asset" | "scene";
  label: string;
  url: string;
}

export interface PanelImageData {
  status: "idle" | "generating" | "done" | "error";
  version?: number;
  url?: string;
  prompt?: string;
  provider?: string;
  generatedAt?: string;
  error?: string;
  referenceImages?: PanelReferenceImageMeta[];
}

export interface ComicExportJob {
  id: string;
  projectId: string;
  episodeId?: string | null;
  format: string;
  spec?: string | null;
  status: string;
  artifacts?: string | null;
  createdAt: string;
}

export interface ComicBatchJob {
  id: string;
  projectId: string;
  type: string;
  status: string;
  progress: string;
  createdAt: string;
}

export interface CreateComicProjectPayload {
  title: string;
  sourceType: ComicSourceType;
  sourceRef?: string;
  trackId?: string;
  inspiration?: string;
  rawText?: string;
  comicFormat?: string;
  stylePreset?: string;
}

export interface GenerateOutlinePayload {
  startOrder?: number;
  count?: number;
  provider?: string;
}

export interface GenerateScriptPayload {
  targetPanelCount?: number;
  densityMode?: "relaxed" | "balanced" | "compact";
  scriptPromptInstruction?: string;
  refreshSourceText?: boolean;
  provider?: string;
}

export interface ExportEpisodePayload {
  format?: "long_image" | "sliced";
  spec?: {
    sliceWidth?: number;
    sliceMaxHeight?: number;
    outputFormat?: "png" | "jpg" | "webp";
    quality?: number;
  };
}

export interface UpdateComicPresetPayload {
  format?: string;
  style?: string;
  promptKeywords?: string;
  imageSize?: string;
}

export interface UpdateEpisodePayload {
  title?: string;
  outline?: string;
  cliffhanger?: string;
  isPaywalled?: boolean;
}

// ─── Facts ────────────────────────────────────────────────────────────────────

export type ComicFactCategory = "completed" | "revealed" | "state_changed";

export interface ComicFact {
  id: string;
  projectId: string;
  episodeOrder: number;
  text: string;
  category: ComicFactCategory;
  createdAt: string;
}
