import type { ChapterSyncDiagnosticsResponse } from "@novelfoundry/shared/types/novel";

export type SyncDiagnosticsViewState = "saving" | "loading" | "error" | "changed" | "conflict" | "ready";

/** Never present an older successful read as evidence for a save or failed refresh. */
export function getSyncDiagnosticsViewState(input: {
  novelId: string;
  chapterId: string;
  chapterUpdatedAt: string;
  isSaving: boolean;
  hasSaveConflict?: boolean;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  data?: ChapterSyncDiagnosticsResponse;
}): SyncDiagnosticsViewState {
  if (input.isSaving) return "saving";
  if (input.hasSaveConflict) return "conflict";
  if (input.isPending || input.isFetching) return "loading";
  if (input.isError || !input.data) return "error";
  const { data } = input;
  if (data.novelId !== input.novelId || data.chapterId !== input.chapterId
    || data.consistency !== "consistent"
    || data.source.chapterUpdatedAt !== input.chapterUpdatedAt) return "changed";
  return "ready";
}
