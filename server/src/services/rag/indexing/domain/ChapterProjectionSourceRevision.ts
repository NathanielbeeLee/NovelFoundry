import { buildSummarySourceHash } from "./RagSummarySourceIdentity";

/** Identity shared by the projection outbox and read-only diagnostics. */
export function buildChapterProjectionSourceRevision(input: {
  chapterId: string;
  contentHash: string;
  chapterUpdatedAt?: Date;
  summary: Parameters<typeof buildSummarySourceHash>[0] | null;
}): string {
  return `${input.chapterId}:${input.contentHash}:${input.chapterUpdatedAt?.toISOString()}:${input.summary ? buildSummarySourceHash(input.summary) : "no-summary"}`;
}
