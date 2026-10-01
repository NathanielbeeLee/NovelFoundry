export interface NovelBible {
  id: string;
  novelId: string;
  coreSetting?: string | null;
  forbiddenRules?: string | null;
  mainPromise?: string | null;
  characterArcs?: string | null;
  worldRules?: string | null;
  rawContent?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlotBeat {
  id: string;
  novelId: string;
  chapterOrder?: number | null;
  beatType: string;
  title: string;
  content: string;
  status: "planned" | "completed" | "skipped";
  metadata?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChapterSummary {
  id: string;
  novelId: string;
  chapterId: string;
  summary: string;
  keyEvents?: string | null;
  characterStates?: string | null;
  hook?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConsistencyFact {
  id: string;
  novelId: string;
  chapterId?: string | null;
  category: "world" | "character" | "timeline" | "plot" | "rule";
  content: string;
  source?: string | null;
  createdAt: string;
  updatedAt: string;
}
