import { currentPolishScope } from "../../../modules/novel/quality/polishPersistence";
import type { RagOwnerType } from "../../rag/types";
import { artifactPrisma as prisma, runWithChapterSource, buildContentHash } from "../artifacts/persistence";
import { ragServices } from "../../rag";
import { briefSummary, extractFacts } from "../novelP0Utils";
import { chapterArtifactBackgroundSyncService } from "./ChapterArtifactBackgroundSyncService";
import type { ArtifactSyncMode } from "../novelCoreShared";
import type { ContentProvenance } from "@novelfoundry/shared/types/canonicalState";
import {
  chapterLifecycleService,
  type ChapterLifecycleService,
} from "./lifecycle";

export interface ChapterArtifactSyncOptions {
  signal?: AbortSignal;
  scheduleBackgroundSync?: boolean;
  artifactSyncMode?: ArtifactSyncMode;
  syncArtifacts?: boolean;
  awaitArtifactDelta?: boolean;
  skipLegacySummaryAndFacts?: boolean;
  provider?: string;
  model?: string;
  temperature?: number;
  contentProvenance?: ContentProvenance;
}

export class ChapterArtifactSyncService {
  constructor(
    private readonly lifecycleService: Pick<ChapterLifecycleService, "saveWorkingContent"> = chapterLifecycleService,
  ) { }

  async saveDraftAndArtifacts(
    novelId: string,
    chapterId: string,
    content: string,
    generationState: "drafted" | "repaired",
    options: ChapterArtifactSyncOptions = {},
  ): Promise<void> {
    const safeContent = await this.lifecycleService.saveWorkingContent({
      novelId,
      chapterId,
      content,
      generationState,
    });
    if (options.syncArtifacts === false) {
      return;
    }
    await this.syncChapterArtifacts(novelId, chapterId, safeContent, options);
  }

  async syncChapterArtifacts(
    novelId: string,
    chapterId: string,
    content: string,
    options: ChapterArtifactSyncOptions = {},
  ): Promise<void> {
    options.signal?.throwIfAborted();
    const contentHash = buildContentHash(content);
    const timelineIds = await runWithChapterSource({ novelId, chapterId, contentHash, signal: options.signal }, async () => {
      if (!options.skipLegacySummaryAndFacts) {
        const facts = extractFacts(content);
        const summary = briefSummary(content, facts);

        await prisma.$transaction(async (tx) => {
          await tx.chapterSummary.upsert({
            where: { chapterId },
            update: {
              summary,
              sourceContentHash: contentHash,
              keyEvents: facts.map((item) => item.content).slice(0, 3).join(""),
              characterStates: facts.filter((item) => item.category === "character").map((item) => item.content).slice(0, 3).join(""),
            },
            create: {
              novelId,
              chapterId,
              summary,
              sourceContentHash: contentHash,
              keyEvents: facts.map((item) => item.content).slice(0, 3).join(""),
              characterStates: facts.filter((item) => item.category === "character").map((item) => item.content).slice(0, 3).join(""),
            },
          });

          await tx.consistencyFact.deleteMany({ where: { novelId, chapterId } });
          if (facts.length > 0) {
            await tx.consistencyFact.createMany({
              data: facts.map((item) => ({
                novelId,
                chapterId,
                category: item.category,
                content: item.content,
                source: "chapter_auto_extract",
              })),
            });
          }
        });
      }

      return this.syncCharacterTimelineForChapter(novelId, chapterId, content);
    });
    options.signal?.throwIfAborted();
    for (const id of timelineIds) this.queueRagUpsert("character_timeline", id);
    if (options.scheduleBackgroundSync !== false) {
      const artifactSyncMode = options.artifactSyncMode ?? "adaptive";
      if (options.awaitArtifactDelta || artifactSyncMode === "strict" || currentPolishScope()) {
        await chapterArtifactBackgroundSyncService.runChapterSyncNow(novelId, chapterId, content, {
          artifactSyncMode,
          provider: options.provider,
          model: options.model,
          temperature: options.temperature,
          contentProvenance: options.contentProvenance,
          signal: options.signal,
        });
      } else {
        chapterArtifactBackgroundSyncService.scheduleChapterSync(novelId, chapterId, content, {
          artifactSyncMode,
          provider: options.provider,
          model: options.model,
          temperature: options.temperature,
          contentProvenance: options.contentProvenance,
          signal: options.signal,
        });
      }
    }
    options.signal?.throwIfAborted();
    this.queueRagUpsert("chapter", chapterId);
    this.queueRagUpsert("chapter_summary", chapterId);
    this.queueRagUpsert("novel", novelId);

    const factRows = await prisma.consistencyFact.findMany({
      where: { novelId, chapterId },
      select: { id: true },
    });
    for (const fact of factRows) {
      this.queueRagUpsert("consistency_fact", fact.id);
    }

  }

  private async syncCharacterTimelineForChapter(novelId: string, chapterId: string, content: string): Promise<string[]> {
    const [chapter, characters] = await Promise.all([
      prisma.chapter.findFirst({
        where: { id: chapterId, novelId },
        select: { order: true, title: true },
      }),
      prisma.character.findMany({
        where: { novelId },
        select: { id: true, name: true },
      }),
    ]);

    if (!chapter || characters.length === 0) {
      return [];
    }

    const events: Array<{
      novelId: string;
      characterId: string;
      chapterId: string;
      chapterOrder: number;
      title: string;
      content: string;
      source: string;
    }> = [];

    for (const character of characters) {
      const lines = content
        .split(/[\n。！？!?]/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 8 && item.includes(character.name))
        .slice(0, 3);
      for (const line of lines) {
        events.push({
          novelId,
          characterId: character.id,
          chapterId,
          chapterOrder: chapter.order,
          title: `${chapter.order} - ${chapter.title}`,
          content: line,
          source: "chapter_extract",
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.characterTimeline.deleteMany({
        where: {
          novelId,
          chapterId,
          source: "chapter_extract",
        },
      });
      if (events.length > 0) {
        await tx.characterTimeline.createMany({ data: events });
      }
    });

    const timelines = await prisma.characterTimeline.findMany({
      where: {
        novelId,
        chapterId,
        source: "chapter_extract",
      },
      select: { id: true },
    });
    return timelines.map((timeline) => timeline.id);
  }

  private queueRagUpsert(ownerType: RagOwnerType, ownerId: string): void {
    void ragServices.ragIndexService.enqueueUpsert(ownerType, ownerId).catch(() => { });
  }
}
