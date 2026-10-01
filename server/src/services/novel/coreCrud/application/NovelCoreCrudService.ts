import { serializeCommercialTagsJson } from "@novelfoundry/shared/types/novelFraming";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { STORY_WORLD_SLICE_SCHEMA_VERSION } from "../../storyWorldSlice/storyWorldSlicePersistence";
import { syncChapterArtifacts } from "../../novelChapterArtifacts";
import { ChapterInput, CreateNovelInput, normalizeNovelOutput, normalizeOptionalTextForCreate, normalizeOptionalTextForUpdate, parseContinuationBookAnalysisSections, serializeContinuationBookAnalysisSections, UpdateNovelInput } from "../../novelCoreShared";
import { queueRagDelete, queueRagUpsert } from "../../novelCoreSupport";
import { NovelListQueryService } from "../infrastructure/NovelListQueryService";

export class NovelCoreCrudService extends NovelListQueryService {
  private validateStoryModeSelection(primaryStoryModeId?: string | null, secondaryStoryModeId?: string | null): void {
    if (primaryStoryModeId && secondaryStoryModeId && primaryStoryModeId === secondaryStoryModeId) {
      throw new AppError("主流派模式和副流派模式不能选择同一项。", 400);
    }
  }

  async createNovel(input: CreateNovelInput) {
    const writingMode = input.writingMode ?? "original";
    const sourceNovelId = input.sourceNovelId ?? null;
    const sourceKnowledgeDocumentId = input.sourceKnowledgeDocumentId ?? null;
    const continuationBookAnalysisId = input.continuationBookAnalysisId ?? null;
    const normalizedContinuationBookAnalysisId =
      writingMode === "continuation" && (sourceNovelId || sourceKnowledgeDocumentId) ? continuationBookAnalysisId : null;
    const continuationBookAnalysisSections = serializeContinuationBookAnalysisSections(
      input.continuationBookAnalysisSections,
    );
    const commercialTagsJson = serializeCommercialTagsJson(input.commercialTags);
    this.validateStoryModeSelection(input.primaryStoryModeId, input.secondaryStoryModeId);

    await this.novelContinuationService.validateWritingModeConfig({
      writingMode,
      sourceNovelId,
      sourceKnowledgeDocumentId,
      continuationBookAnalysisId: normalizedContinuationBookAnalysisId,
    });

    const created = await prisma.novel.create({
      data: {
        title: input.title,
        description: input.description,
        targetAudience: normalizeOptionalTextForCreate(input.targetAudience),
        bookSellingPoint: normalizeOptionalTextForCreate(input.bookSellingPoint),
        competingFeel: normalizeOptionalTextForCreate(input.competingFeel),
        first30ChapterPromise: normalizeOptionalTextForCreate(input.first30ChapterPromise),
        commercialTagsJson,
        genreId: input.genreId,
        primaryStoryModeId: input.primaryStoryModeId ?? null,
        secondaryStoryModeId: input.secondaryStoryModeId ?? null,
        worldId: input.worldId,
        writingMode,
        projectMode: input.projectMode,
        creationExperience: input.creationExperience ?? "professional",
        narrativeForm: input.narrativeForm ?? "long_novel",
        targetWordCount: input.targetWordCount,
        derivedFromNovelId: input.derivedFromNovelId,
        narrativePov: input.narrativePov,
        pacePreference: input.pacePreference,
        styleTone: input.styleTone,
        emotionIntensity: input.emotionIntensity,
        aiFreedom: input.aiFreedom,
        postGenerationStyleReviewEnabled: input.postGenerationStyleReviewEnabled,
        defaultChapterLength: input.defaultChapterLength,
        estimatedChapterCount: input.estimatedChapterCount,
        projectStatus: input.projectStatus,
        storylineStatus: input.storylineStatus,
        outlineStatus: input.outlineStatus,
        resourceReadyScore: input.resourceReadyScore,
        sourceNovelId: writingMode === "continuation" ? sourceNovelId : null,
        sourceKnowledgeDocumentId: writingMode === "continuation" ? sourceKnowledgeDocumentId : null,
        continuationBookAnalysisId: normalizedContinuationBookAnalysisId,
        continuationBookAnalysisSections:
          writingMode === "continuation"
          && (sourceNovelId || sourceKnowledgeDocumentId)
          && normalizedContinuationBookAnalysisId
            ? continuationBookAnalysisSections
            : null,
      },
    });

    queueRagUpsert("novel", created.id);
    if (created.worldId) {
      queueRagUpsert("world", created.worldId);
    }
    return normalizeNovelOutput(created);
  }

  async updateNovel(id: string, input: UpdateNovelInput) {
    const existing = await prisma.novel.findUnique({
      where: { id },
      select: {
        id: true,
        worldId: true,
        writingMode: true,
        sourceNovelId: true,
        sourceKnowledgeDocumentId: true,
        continuationBookAnalysisId: true,
        continuationBookAnalysisSections: true,
        primaryStoryModeId: true,
        secondaryStoryModeId: true,
      },
    });
    if (!existing) {
      throw new Error("小说不存在");
    }

    const nextWritingMode = input.writingMode ?? (existing.writingMode === "continuation" ? "continuation" : "original");
    const nextSourceNovelId = input.sourceNovelId !== undefined ? input.sourceNovelId : existing.sourceNovelId;
    const nextSourceKnowledgeDocumentId = input.sourceKnowledgeDocumentId !== undefined
      ? input.sourceKnowledgeDocumentId
      : existing.sourceKnowledgeDocumentId;
    const nextContinuationBookAnalysisId = input.continuationBookAnalysisId !== undefined
      ? input.continuationBookAnalysisId
      : existing.continuationBookAnalysisId;
    const nextContinuationBookAnalysisSections = input.continuationBookAnalysisSections !== undefined
      ? input.continuationBookAnalysisSections
      : parseContinuationBookAnalysisSections(existing.continuationBookAnalysisSections);
    const nextPrimaryStoryModeId = input.primaryStoryModeId !== undefined
      ? input.primaryStoryModeId
      : existing.primaryStoryModeId;
    const nextSecondaryStoryModeId = input.secondaryStoryModeId !== undefined
      ? input.secondaryStoryModeId
      : existing.secondaryStoryModeId;
    const normalizedNextContinuationBookAnalysisId =
      nextWritingMode === "continuation" && (nextSourceNovelId || nextSourceKnowledgeDocumentId)
        ? nextContinuationBookAnalysisId
        : null;
    this.validateStoryModeSelection(nextPrimaryStoryModeId, nextSecondaryStoryModeId);

    await this.novelContinuationService.validateWritingModeConfig({
      novelId: id,
      writingMode: nextWritingMode,
      sourceNovelId: nextSourceNovelId,
      sourceKnowledgeDocumentId: nextSourceKnowledgeDocumentId,
      continuationBookAnalysisId: normalizedNextContinuationBookAnalysisId,
    });

    const {
      continuationBookAnalysisSections: _ignoreSectionPatch,
      targetAudience: _ignoreTargetAudience,
      bookSellingPoint: _ignoreBookSellingPoint,
      competingFeel: _ignoreCompetingFeel,
      first30ChapterPromise: _ignoreFirst30ChapterPromise,
      commercialTags: _ignoreCommercialTags,
      ...restInput
    } = input;

    const serializedContinuationSections = serializeContinuationBookAnalysisSections(nextContinuationBookAnalysisSections);
    const commercialTagsJson = input.commercialTags !== undefined
      ? serializeCommercialTagsJson(input.commercialTags)
      : undefined;
    const nextWorldId = input.worldId !== undefined ? input.worldId : existing.worldId;
    const shouldResetWorldSlice = nextWorldId !== existing.worldId;

    const updated = await prisma.novel.update({
      where: { id },
      data: {
        ...restInput,
        sourceNovelId: nextWritingMode === "continuation" ? nextSourceNovelId : null,
        sourceKnowledgeDocumentId: nextWritingMode === "continuation" ? nextSourceKnowledgeDocumentId : null,
        continuationBookAnalysisId: normalizedNextContinuationBookAnalysisId,
        primaryStoryModeId: nextPrimaryStoryModeId ?? null,
        secondaryStoryModeId: nextSecondaryStoryModeId ?? null,
        targetAudience: normalizeOptionalTextForUpdate(input.targetAudience),
        bookSellingPoint: normalizeOptionalTextForUpdate(input.bookSellingPoint),
        competingFeel: normalizeOptionalTextForUpdate(input.competingFeel),
        first30ChapterPromise: normalizeOptionalTextForUpdate(input.first30ChapterPromise),
        commercialTagsJson,
        continuationBookAnalysisSections:
          nextWritingMode === "continuation"
          && (nextSourceNovelId || nextSourceKnowledgeDocumentId)
          && normalizedNextContinuationBookAnalysisId
            ? serializedContinuationSections
            : null,
        ...(shouldResetWorldSlice
          ? {
            storyWorldSliceJson: null,
            storyWorldSliceOverridesJson: null,
            storyWorldSliceSchemaVersion: STORY_WORLD_SLICE_SCHEMA_VERSION,
          }
          : {}),
      },
      include: {
        primaryStoryMode: true,
        secondaryStoryMode: true,
      },
    });

    queueRagUpsert("novel", id);
    if (updated.worldId) {
      queueRagUpsert("world", updated.worldId);
    }
    return normalizeNovelOutput(updated);
  }

  async deleteNovel(id: string) {
    await prisma.$transaction(async (transaction) => {
      const [failedWorkflowTasks, failedAgentRuns, failedPipelineJobs, failedImageTasks] = await Promise.all([
        transaction.novelWorkflowTask.findMany({ where: { novelId: id, status: "failed" }, select: { id: true } }),
        transaction.agentRun.findMany({ where: { novelId: id, status: "failed" }, select: { id: true } }),
        transaction.generationJob.findMany({ where: { novelId: id, status: "failed" }, select: { id: true } }),
        transaction.imageGenerationTask.findMany({ where: { novelId: id, status: "failed" }, select: { id: true } }),
      ]);
      const failedWorkflowTaskIds = failedWorkflowTasks.map((task) => task.id);
      const failedAgentRunIds = failedAgentRuns.map((task) => task.id);
      const failedPipelineJobIds = failedPipelineJobs.map((task) => task.id);
      const failedImageTaskIds = failedImageTasks.map((task) => task.id);

      if (
        failedWorkflowTaskIds.length > 0
        || failedAgentRunIds.length > 0
        || failedPipelineJobIds.length > 0
        || failedImageTaskIds.length > 0
      ) {
        await transaction.taskCenterArchive.deleteMany({
          where: {
            OR: [
              { taskKind: "novel_workflow", taskId: { in: failedWorkflowTaskIds } },
              { taskKind: "agent_run", taskId: { in: failedAgentRunIds } },
              { taskKind: "novel_pipeline", taskId: { in: failedPipelineJobIds } },
              { taskKind: "image_generation", taskId: { in: failedImageTaskIds } },
            ],
          },
        });
      }
      if (failedWorkflowTaskIds.length > 0) {
        await transaction.novelWorkflowTask.deleteMany({ where: { id: { in: failedWorkflowTaskIds } } });
      }
      if (failedAgentRunIds.length > 0) {
        await transaction.agentRun.deleteMany({ where: { id: { in: failedAgentRunIds } } });
      }

      await transaction.novel.delete({ where: { id } });
    });
    queueRagDelete("novel", id);
    queueRagDelete("bible", id);
  }

  async listChapters(novelId: string) {
    return prisma.chapter.findMany({
      where: { novelId },
      orderBy: { order: "asc" },
      include: { chapterSummary: true },
    });
  }

  async createChapter(novelId: string, input: ChapterInput) {
    const chapter = await prisma.chapter.create({
      data: {
        novelId,
        title: input.title,
        order: input.order,
        content: input.content ?? "",
        expectation: input.expectation,
        chapterStatus: input.chapterStatus,
        targetWordCount: input.targetWordCount ?? null,
        conflictLevel: input.conflictLevel ?? null,
        revealLevel: input.revealLevel ?? null,
        mustAvoid: input.mustAvoid ?? null,
        taskSheet: input.taskSheet ?? null,
        sceneCards: input.sceneCards ?? null,
        repairHistory: input.repairHistory ?? null,
        qualityScore: input.qualityScore ?? null,
        continuityScore: input.continuityScore ?? null,
        characterScore: input.characterScore ?? null,
        pacingScore: input.pacingScore ?? null,
        riskFlags: input.riskFlags ?? null,
        generationState: "planned",
      },
    });

    if (chapter.content) {
      await syncChapterArtifacts(novelId, chapter.id, chapter.content);
    }
    await this.volumeService.mirrorChapterIntoWorkspace(novelId, {
      id: chapter.id,
      order: chapter.order,
      title: chapter.title,
      expectation: chapter.expectation,
      targetWordCount: chapter.targetWordCount,
      conflictLevel: chapter.conflictLevel,
      revealLevel: chapter.revealLevel,
      mustAvoid: chapter.mustAvoid,
      taskSheet: chapter.taskSheet,
      sceneCards: chapter.sceneCards,
    }).catch(() => null);
    queueRagUpsert("chapter", chapter.id);
    return chapter;
  }

  async updateChapter(novelId: string, chapterId: string, input: Partial<ChapterInput>) {
    const exists = await prisma.chapter.findFirst({ where: { id: chapterId, novelId }, select: { id: true } });
    if (!exists) {
      throw new Error("章节不存在");
    }

    const chapter = await prisma.chapter.update({
      where: { id: chapterId },
      data: {
        title: input.title,
        order: input.order,
        content: input.content,
        expectation: input.expectation,
        chapterStatus: input.chapterStatus,
        targetWordCount: input.targetWordCount,
        conflictLevel: input.conflictLevel,
        revealLevel: input.revealLevel,
        mustAvoid: input.mustAvoid,
        taskSheet: input.taskSheet,
        sceneCards: input.sceneCards,
        repairHistory: input.repairHistory,
        qualityScore: input.qualityScore,
        continuityScore: input.continuityScore,
        characterScore: input.characterScore,
        pacingScore: input.pacingScore,
        riskFlags: input.riskFlags,
      },
    });

    if (typeof input.content === "string") {
      await syncChapterArtifacts(novelId, chapterId, input.content);
    }
    await this.volumeService.mirrorChapterIntoWorkspace(novelId, {
      id: chapter.id,
      order: chapter.order,
      title: chapter.title,
      expectation: chapter.expectation,
      targetWordCount: chapter.targetWordCount,
      conflictLevel: chapter.conflictLevel,
      revealLevel: chapter.revealLevel,
      mustAvoid: chapter.mustAvoid,
      taskSheet: chapter.taskSheet,
      sceneCards: chapter.sceneCards,
    }).catch(() => null);
    queueRagUpsert("chapter", chapterId);
    return chapter;
  }

  async deleteChapter(novelId: string, chapterId: string) {
    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId },
      select: {
        id: true,
        content: true,
        generationState: true,
        chapterStatus: true,
        expectation: true,
        taskSheet: true,
        sceneCards: true,
        repairHistory: true,
        riskFlags: true,
      },
    });
    if (!chapter) {
      throw new Error("章节不存在");
    }
    const canRemove = chapter.generationState === "planned"
      && (chapter.chapterStatus ?? "unplanned") === "unplanned"
      && !chapter.content?.trim()
      && !chapter.expectation?.trim()
      && !chapter.taskSheet?.trim()
      && !chapter.sceneCards?.trim()
      && !chapter.repairHistory?.trim()
      && !chapter.riskFlags?.trim();
    if (!canRemove) {
      throw new Error("只能移除尚未进入写作或规划流程的空白手动章节");
    }
    queueRagDelete("chapter", chapterId);
    queueRagDelete("chapter_summary", chapterId);
    const deleted = await prisma.chapter.deleteMany({ where: { id: chapterId, novelId } });
    if (deleted.count === 0) {
      throw new Error("章节不存在");
    }
  }
}
