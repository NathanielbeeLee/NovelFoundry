export interface ChapterDraft {
  content: string;
  savedContent: string;
  remoteContent: string;
  pendingContent?: string;
  status: "idle" | "saving" | "saved" | "error";
}

export function createChapterDraft(content: string): ChapterDraft {
  return { content, savedContent: content, remoteContent: content, status: "idle" };
}

export function editChapterDraft(draft: ChapterDraft, content: string): ChapterDraft {
  return { ...draft, content, status: draft.status === "saving" ? "saving" : "idle" };
}

export function acknowledgeChapterSave(draft: ChapterDraft, submitted: string): ChapterDraft {
  return { ...draft, pendingContent: undefined, savedContent: submitted, status: draft.content === submitted ? "saved" : "idle" };
}

/** Remote refreshes acknowledge persisted prose; they never replace a dirty local draft.
 * Equivalent save echoes may differ only by the editor's paragraph normalization.
 * Cross-client write conflicts still require an API-level expected-source contract.
 */
export function receiveChapterContent(
  draft: ChapterDraft,
  content: string,
  equivalentToSaved = content === draft.savedContent,
): ChapterDraft {
  if (content === draft.remoteContent) {
    if (draft.pendingContent !== undefined && draft.status !== "saving" && draft.content === draft.savedContent) {
      return createChapterDraft(draft.pendingContent);
    }
    return draft;
  }
  if (equivalentToSaved) return { ...draft, remoteContent: content, pendingContent: undefined };
  if (draft.status === "saving" || draft.content !== draft.savedContent) {
    return { ...draft, remoteContent: content, pendingContent: content };
  }
  return createChapterDraft(content);
}
