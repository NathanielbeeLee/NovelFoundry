export type ChapterSyncDiagnosticKey = "summary" | "artifacts" | "timeline" | "ragChapter" | "ragSummary";

export type ChapterSyncDiagnosticStatus =
  | "current" | "running" | "queued" | "failed" | "stale"
  | "degraded" | "unknown" | "not_applicable";

export interface ChapterSyncDiagnosticItem {
  key: ChapterSyncDiagnosticKey;
  status: ChapterSyncDiagnosticStatus;
  /** Product-facing explanation; never includes raw checkpoint errors or prose. */
  detail: string;
  updatedAt: string | null;
  matchesCurrentSource: boolean | null;
}

/** Read-only evidence for the saved chapter, not the editor's unsaved draft. */
export interface ChapterSyncDiagnosticsResponse {
  novelId: string;
  chapterId: string;
  checkedAt: string;
  source: {
    chapterUpdatedAt: string;
    contentHash: string;
    hasContent: boolean;
  };
  consistency: "consistent" | "changed_during_read";
  items: ChapterSyncDiagnosticItem[];
}
