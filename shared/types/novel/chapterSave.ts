/** Compare the exact persisted prose, including null and whitespace. */
export interface ChapterContentWritePrecondition {
  expectedContent: string | null;
}

export interface ChapterSaveConflict {
  code: "CHAPTER_CONTENT_CONFLICT";
  chapterId: string;
  currentContent: string | null;
  updatedAt: string;
}
