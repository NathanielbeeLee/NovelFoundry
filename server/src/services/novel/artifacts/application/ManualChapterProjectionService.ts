import { chapterArtifactBackgroundSyncService } from "../../runtime/ChapterArtifactBackgroundSyncService";
import { buildContentHash } from "../domain/ChapterSourceIdentity";
import { artifactPrisma, runWithChapterSource, StaleChapterSourceError } from "../infrastructure/ChapterSourceTransaction";
import { queueChapterProjectionIndexes } from "../infrastructure/ChapterProjectionIndexQueue";

/** A committed manual save succeeds independently of AI/index follow-up work. */
export async function scheduleManualChapterProjections(novelId: string, chapterId: string, content: string): Promise<void> {
  try {
    const contentHash = buildContentHash(content);
    const current = await artifactPrisma.chapter.findFirst({
      where: { id: chapterId, novelId }, select: { content: true },
    });
    if (!current || buildContentHash(current.content ?? "") !== contentHash) return;
    try {
      await runWithChapterSource({ novelId, chapterId, contentHash }, queueChapterProjectionIndexes);
    } catch (error) {
      if (error instanceof StaleChapterSourceError) return;
      console.warn("[manual-chapter-projections] index scheduling failed; AI sync remains scheduled", {
        novelId, chapterId, error: error instanceof Error ? error.message : String(error),
      });
    }
    // Blank prose has already invalidated automatic projections in the save transaction.
    if (!current.content?.trim()) return;
    chapterArtifactBackgroundSyncService.scheduleChapterSync(novelId, chapterId, current.content);
  } catch (error) {
    if (error instanceof StaleChapterSourceError) return;
    console.warn("[manual-chapter-projections] saved prose; follow-up scheduling failed", {
      novelId, chapterId, error: error instanceof Error ? error.message : String(error),
    });
  }
}
