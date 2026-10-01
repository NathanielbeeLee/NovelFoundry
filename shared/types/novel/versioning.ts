export type StorylineVersionStatus = "draft" | "active" | "frozen";

export interface StorylineVersion {
  id: string;
  novelId: string;
  version: number;
  status: StorylineVersionStatus;
  content: string;
  diffSummary?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StorylineDiff {
  id: string;
  novelId: string;
  version: number;
  status: StorylineVersionStatus;
  diffSummary?: string | null;
  changedLines: number;
  affectedCharacters: number;
  affectedChapters: number;
}

export interface CreativeDecision {
  id: string;
  novelId: string;
  chapterId?: string | null;
  category: string;
  content: string;
  importance: string;
  expiresAt?: number | null;
  sourceType?: string | null;
  sourceRefId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NovelSnapshot {
  id: string;
  novelId: string;
  label?: string | null;
  snapshotData: string;
  triggerType: "manual" | "auto_milestone" | "before_pipeline";
  createdAt: string;
}

export type NovelSnapshotListItem = Omit<NovelSnapshot, "snapshotData">;
