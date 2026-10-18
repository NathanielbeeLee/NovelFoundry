import { ragServices } from "../../../rag";
import { buildSummarySourceHash } from "../../../rag/indexing/sourceIdentity";
import { artifactPrisma, currentChapterSource } from "./ChapterSourceTransaction";

/** Index work is an outbox in the same source-locked transaction as its projection. */
export async function queueChapterProjectionIndexes(): Promise<void> {
  const source = currentChapterSource();
  if (!source) throw new Error("Chapter projection indexing requires a source transaction.");
  const [chapter, summary] = await Promise.all([
    artifactPrisma.chapter.findFirst({ where: { id: source.chapterId, novelId: source.novelId }, select: { updatedAt: true } }),
    artifactPrisma.chapterSummary.findUnique({ where: { chapterId: source.chapterId } }),
  ]);
  const sourceRevision = `${source.chapterId}:${source.contentHash}:${chapter?.updatedAt.toISOString()}:${summary ? buildSummarySourceHash(summary) : "no-summary"}`;
  for (const [ownerType, ownerId] of [
    ["chapter", source.chapterId], ["chapter_summary", source.chapterId], ["novel", source.novelId],
  ] as const) {
    await ragServices.ragIndexService.enqueueOwnerJob("upsert", ownerType, ownerId, {
      db: artifactPrisma,
      payload: { sourceRevision },
    });
  }
  const timelines = await artifactPrisma.characterTimeline.findMany({
    where: { novelId: source.novelId, chapterId: source.chapterId, source: "chapter_extract" }, select: { id: true },
  });
  for (const { id } of timelines) {
    await ragServices.ragIndexService.enqueueOwnerJob("upsert", "character_timeline", id, {
      db: artifactPrisma, payload: { sourceRevision },
    });
  }
}
