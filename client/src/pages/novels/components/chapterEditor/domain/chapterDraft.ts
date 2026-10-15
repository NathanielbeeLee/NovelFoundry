export interface ChapterDraft {
  content: string;
  savedContent: string;
  remoteContent: string;
  sourceContent: string | null;
  remoteSourceContent: string | null;
  pendingSourceContent?: string | null;
  pendingContent?: string;
  status: "idle" | "saving" | "saved" | "error";
}

export function createChapterDraft(content: string, sourceContent: string | null = content): ChapterDraft {
  return { content, savedContent: content, remoteContent: content, sourceContent, remoteSourceContent: sourceContent, status: "idle" };
}

export function editChapterDraft(draft: ChapterDraft, content: string): ChapterDraft {
  return { ...draft, content, status: draft.status === "saving" ? "saving" : "idle" };
}

export function acknowledgeChapterSave(draft: ChapterDraft, submitted: string): ChapterDraft {
  return { ...draft, pendingContent: undefined, pendingSourceContent: undefined, sourceContent: submitted, savedContent: submitted, status: draft.content === submitted ? "saved" : "idle" };
}

/** Remote refreshes acknowledge persisted prose; they never replace a dirty local draft.
 * Equivalent save echoes may differ only by the editor's paragraph normalization.
 * The raw source is the CAS token; normalized editor content is never that token.
 */
export function receiveChapterContent(
  draft: ChapterDraft,
  content: string,
  equivalentToSaved = content === draft.savedContent,
  sourceContent: string | null = content,
): ChapterDraft {
  if (content === draft.remoteContent && sourceContent === draft.remoteSourceContent) {
    if (draft.pendingContent !== undefined && draft.status !== "saving" && draft.content === draft.savedContent) {
      return createChapterDraft(draft.pendingContent, draft.pendingSourceContent);
    }
    return draft;
  }
  if (equivalentToSaved && sourceContent === draft.sourceContent) return { ...draft, remoteContent: content, remoteSourceContent: sourceContent, pendingContent: undefined, pendingSourceContent: undefined };
  if (draft.status === "saving" || draft.content !== draft.savedContent) {
    return { ...draft, remoteContent: content, remoteSourceContent: sourceContent, pendingContent: content, pendingSourceContent: sourceContent };
  }
  if (equivalentToSaved) return { ...draft, sourceContent, remoteContent: content, remoteSourceContent: sourceContent };
  return createChapterDraft(content, sourceContent);
}

/** Explicit choice after showing both texts. Keep old query observation until refetch catches up. */
export function resolveChapterConflict(
  draft: ChapterDraft, remoteContent: string, rawContent: string | null, keepLocal: boolean,
): ChapterDraft {
  return { ...draft, content: keepLocal ? draft.content : remoteContent,
    savedContent: remoteContent, sourceContent: rawContent,
    pendingContent: undefined, pendingSourceContent: undefined, status: "idle" };
}
