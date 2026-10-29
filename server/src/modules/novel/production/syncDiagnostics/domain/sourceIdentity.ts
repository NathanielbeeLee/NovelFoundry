import { buildContentHash } from "../../../../../services/novel/artifacts/persistence";
import { buildChapterProjectionSourceRevision } from "../../../../../services/rag/indexing/sourceIdentity";
import type { SavedChapter, SavedSummary } from "./contracts";

export function sourceRevision(chapter: SavedChapter, summary: SavedSummary | null): string {
  return buildChapterProjectionSourceRevision({
    chapterId: chapter.id, contentHash: buildContentHash(chapter.content ?? ""), chapterUpdatedAt: chapter.updatedAt, summary,
  });
}

export function sameSource(
  before: { chapter: SavedChapter; summary: SavedSummary | null },
  after: { chapter: SavedChapter; summary: SavedSummary | null } | null,
): boolean {
  return after !== null
    && before.chapter.content === after.chapter.content
    && sourceRevision(before.chapter, before.summary) === sourceRevision(after.chapter, after.summary)
    && before.summary?.sourceContentHash === after.summary?.sourceContentHash
    && before.summary?.updatedAt.getTime() === after.summary?.updatedAt.getTime();
}

export function parseEvidence(value: string | null): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}
