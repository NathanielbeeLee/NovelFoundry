import { artifactPrisma as prisma, buildContentHash, currentChapterSource } from "../../../artifacts/persistence";
import { hashContent, TIMELINE_FINALIZATION_RUNNING_STALE_MS, type ChapterTimelineFinalizationMode, type TimelineFinalizationClaimStatus } from "../domain/TimelineFinalizationContract";

export class TimelineFinalizationCheckpointStore {
  async findCurrentFinalizationMode(input: {
    novelId: string;
    chapterId: string;
    content: string;
  }): Promise<ChapterTimelineFinalizationMode | null> {
    const chapter = await prisma.chapter.findFirst({
      where: { id: input.chapterId, novelId: input.novelId }, select: { content: true },
    });
    if (!chapter || buildContentHash(chapter.content ?? "") !== buildContentHash(input.content)) return null;
    const contentHash = hashContent(input.content.trim());
    const row = await prisma.chapterArtifactSyncCheckpoint.findFirst({
      where: {
        novelId: input.novelId,
        chapterId: input.chapterId,
        contentHash,
        artifactType: "timeline_finalization",
        syncMode: { in: ["stable", "degraded"] },
        status: "succeeded",
      },
      orderBy: [
        { syncMode: "desc" },
        { updatedAt: "desc" },
      ],
      select: { syncMode: true },
    });
    return row?.syncMode === "stable" || row?.syncMode === "degraded" ? row.syncMode : null;
  }

  async markCheckpoint(input: {
    novelId: string;
    chapterId: string;
    contentHash: string;
    syncMode: ChapterTimelineFinalizationMode;
    sourceStage: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await prisma.chapterArtifactSyncCheckpoint.upsert({
      where: {
        novelId_chapterId_contentHash_artifactType_syncMode: {
          novelId: input.novelId,
          chapterId: input.chapterId,
          contentHash: input.contentHash,
          artifactType: "timeline_finalization",
          syncMode: input.syncMode,
        },
      },
      create: {
        novelId: input.novelId,
        chapterId: input.chapterId,
        contentHash: input.contentHash,
        artifactType: "timeline_finalization",
        syncMode: input.syncMode,
        status: "succeeded",
        sourceType: "chapter_runtime",
        sourceStage: input.sourceStage,
        metadataJson: JSON.stringify({ ...input.metadata, sourceContentHash: currentChapterSource()?.contentHash }),
      },
      update: {
        status: "succeeded",
        sourceType: "chapter_runtime",
        sourceStage: input.sourceStage,
        metadataJson: JSON.stringify({ ...input.metadata, sourceContentHash: currentChapterSource()?.contentHash }),
        updatedAt: new Date(),
      },
    });
  }

  async claimCheckpoint(input: {
    novelId: string;
    chapterId: string;
    contentHash: string;
    syncMode: ChapterTimelineFinalizationMode;
    sourceStage: string;
    metadata: Record<string, unknown>;
  }): Promise<TimelineFinalizationClaimStatus> {
    const where = {
      novelId_chapterId_contentHash_artifactType_syncMode: {
        novelId: input.novelId,
        chapterId: input.chapterId,
        contentHash: input.contentHash,
        artifactType: "timeline_finalization",
        syncMode: input.syncMode,
      },
    };
    const metadataJson = JSON.stringify(input.metadata);
    try {
      await prisma.chapterArtifactSyncCheckpoint.create({
        data: {
          novelId: input.novelId,
          chapterId: input.chapterId,
          contentHash: input.contentHash,
          artifactType: "timeline_finalization",
          syncMode: input.syncMode,
          status: "running",
          sourceType: "chapter_runtime",
          sourceStage: input.sourceStage,
          metadataJson,
        },
      });
      return "claimed";
    } catch {
      const existing = await prisma.chapterArtifactSyncCheckpoint.findUnique({
        where,
        select: { status: true, updatedAt: true },
      }).catch(() => null);
      if (existing?.status === "succeeded") {
        return "already_done";
      }
      const staleBefore = new Date(Date.now() - TIMELINE_FINALIZATION_RUNNING_STALE_MS);
      if (existing?.status === "running" && existing.updatedAt > staleBefore) {
        return "running";
      }
      const claimed = await prisma.chapterArtifactSyncCheckpoint.updateMany({
        where: {
          novelId: input.novelId,
          chapterId: input.chapterId,
          contentHash: input.contentHash,
          artifactType: "timeline_finalization",
          syncMode: input.syncMode,
          OR: [
            { status: { not: "running" } },
            { updatedAt: { lt: staleBefore } },
          ],
        },
        data: {
          status: "running",
          sourceType: "chapter_runtime",
          sourceStage: input.sourceStage,
          metadataJson,
          updatedAt: new Date(),
        },
      }).catch(() => ({ count: 0 }));
      return claimed.count > 0 ? "claimed" : "running";
    }
  }

  async markCheckpointFailed(input: {
    novelId: string;
    chapterId: string;
    contentHash: string;
    syncMode: ChapterTimelineFinalizationMode;
    sourceStage: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await prisma.chapterArtifactSyncCheckpoint.updateMany({
      where: {
        novelId: input.novelId,
        chapterId: input.chapterId,
        contentHash: input.contentHash,
        artifactType: "timeline_finalization",
        syncMode: input.syncMode,
        status: "running",
      },
      data: {
        status: "failed",
        sourceType: "chapter_runtime",
        sourceStage: input.sourceStage,
        metadataJson: JSON.stringify(input.metadata),
        updatedAt: new Date(),
      },
    }).catch(() => null);
  }
}
