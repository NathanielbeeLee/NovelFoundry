export type ChapterEditorOperation =
  | "polish"
  | "expand"
  | "compress"
  | "emotion"
  | "conflict"
  | "custom";

export type ChapterEditorRevisionSource = "preset" | "freeform";

export type ChapterEditorRevisionScope = "selection" | "chapter";

export interface ChapterEditorTargetRange {
  from: number;
  to: number;
  text: string;
}

export interface ChapterEditorContextWindow {
  beforeParagraphs: string[];
  afterParagraphs: string[];
}

export interface ChapterEditorContextSummary {
  goalSummary?: string | null;
  chapterSummary?: string | null;
  styleSummary?: string | null;
  characterStateSummary?: string | null;
  worldConstraintSummary?: string | null;
}

export interface ChapterEditorRewriteConstraints {
  keepFacts: boolean;
  keepPov: boolean;
  noUnauthorizedSetting: boolean;
  preserveCoreInfo: boolean;
}

export interface ChapterEditorDiffChunk {
  id: string;
  type: "equal" | "insert" | "delete";
  text: string;
}

export interface ChapterEditorCandidate {
  id: string;
  label: string;
  content: string;
  summary?: string | null;
  rationale?: string | null;
  riskNotes?: string[];
  diffChunks: ChapterEditorDiffChunk[];
  semanticTags?: string[];
}

export interface ChapterEditorMacroContext {
  chapterRoleInVolume: string;
  volumeTitle: string;
  volumePositionLabel: string;
  volumePhaseLabel: string;
  paceDirective: string;
  chapterMission: string;
  previousChapterBridge: string;
  nextChapterBridge: string;
  activePlotThreads: string[];
  characterStateSummary: string;
  worldConstraintSummary: string;
  mustKeepConstraints: string[];
}

export interface ChapterEditorDiagnosticCard {
  id: string;
  title: string;
  problemSummary: string;
  whyItMatters: string;
  recommendedAction: ChapterEditorOperation;
  recommendedScope: ChapterEditorRevisionScope;
  anchorRange?: Pick<ChapterEditorTargetRange, "from" | "to"> | null;
  paragraphLabel?: string | null;
  severity: "low" | "medium" | "high" | "critical";
  sourceTags: string[];
}

export interface ChapterEditorRecommendedTask {
  title: string;
  summary: string;
  recommendedAction: ChapterEditorOperation;
  recommendedScope: ChapterEditorRevisionScope;
  anchorRange?: Pick<ChapterEditorTargetRange, "from" | "to"> | null;
  paragraphLabel?: string | null;
}

export interface ChapterEditorWorkspaceResponse {
  chapterMeta: {
    chapterId: string;
    order: number;
    title: string;
    wordCount: number;
    openIssueCount: number;
    styleSummary?: string | null;
    updatedAt: string;
  };
  macroContext: ChapterEditorMacroContext;
  diagnosticCards: ChapterEditorDiagnosticCard[];
  recommendedTask: ChapterEditorRecommendedTask | null;
  refreshReason: string;
}

export interface ChapterEditorAiRevisionIntent {
  editGoal: string;
  toneShift: string;
  paceAdjustment: string;
  conflictAdjustment: string;
  emotionAdjustment: string;
  mustPreserve: string[];
  mustAvoid: string[];
  strength: "light" | "medium" | "strong";
  reasoningSummary: string;
}

export interface ChapterEditorAiRevisionRequest {
  source: ChapterEditorRevisionSource;
  scope: ChapterEditorRevisionScope;
  presetOperation?: ChapterEditorOperation;
  instruction?: string;
  contentSnapshot: string;
  selection?: ChapterEditorTargetRange;
  context?: ChapterEditorContextWindow;
  constraints: ChapterEditorRewriteConstraints;
  provider?: import("../../llm").LLMProvider;
  model?: string;
  temperature?: number;
}

export interface ChapterEditorAiRevisionResponse {
  sessionId: string;
  scope: ChapterEditorRevisionScope;
  resolvedIntent: ChapterEditorAiRevisionIntent;
  targetRange: ChapterEditorTargetRange;
  macroAlignmentNote?: string | null;
  candidates: ChapterEditorCandidate[];
  activeCandidateId: string | null;
}

export interface ChapterEditorRewritePreviewRequest {
  operation: ChapterEditorOperation;
  customInstruction?: string;
  contentSnapshot: string;
  targetRange: ChapterEditorTargetRange;
  context: ChapterEditorContextWindow;
  chapterContext: ChapterEditorContextSummary;
  constraints: ChapterEditorRewriteConstraints;
  provider?: import("../../llm").LLMProvider;
  model?: string;
  temperature?: number;
}

export interface ChapterEditorRewritePreviewResponse {
  sessionId: string;
  operation: ChapterEditorOperation;
  targetRange: ChapterEditorTargetRange;
  candidates: ChapterEditorCandidate[];
  activeCandidateId: string | null;
}
