import type { DirectorArtifactRef, DirectorManualEditInventory, DirectorWorkspaceInventory } from "@novelfoundry/shared/types/directorRuntime";
import { prisma } from "../../../../../../db/prisma";
import { normalizeDirectorArtifactRef } from "../../DirectorArtifactLedger";
import { buildDirectorWorkspaceArtifactInventory, hasContinuableQualityLoopRiskFlags } from "../../DirectorWorkspaceArtifactInventory";
import { buildManualEditInventoryFromArtifacts } from "../domain/manualEditInventory";

export class DirectorWorkspaceInventoryRepository {
  protected async buildManualEditInventory(input: {
    novelId: string;
    inventory: DirectorWorkspaceInventory;
    previousArtifacts: DirectorArtifactRef[];
    focusedChapterId?: string | null;
    comparedAgainstTaskId?: string | null;
  }): Promise<DirectorManualEditInventory> {
    const draftArtifacts = input.inventory.artifacts
      .filter((artifact) => artifact.artifactType === "chapter_draft" && artifact.targetType === "chapter" && artifact.targetId);
    const chapterIds = [...new Set(draftArtifacts.map((artifact) => artifact.targetId as string))];
    const chapters = chapterIds.length > 0
      ? await prisma.chapter.findMany({
        where: { novelId: input.novelId, id: { in: chapterIds } },
        select: {
          id: true,
          title: true,
          order: true,
          updatedAt: true,
        },
      })
      : [];
    const chapterMetaById = Object.fromEntries(chapters.map((chapter) => [
      chapter.id,
      {
        title: chapter.title,
        order: chapter.order,
        changedAt: chapter.updatedAt.toISOString(),
      },
    ]));
    return buildManualEditInventoryFromArtifacts({
      novelId: input.novelId,
      artifacts: input.inventory.artifacts,
      previousArtifacts: input.previousArtifacts,
      focusedChapterId: input.focusedChapterId,
      comparedAgainstTaskId: input.comparedAgainstTaskId,
      chapterMetaById,
    });
  }

  protected async buildInventory(novelId: string): Promise<DirectorWorkspaceInventory> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        id: true,
        title: true,
        worldId: true,
        sourceKnowledgeDocumentId: true,
        continuationBookAnalysisId: true,
        updatedAt: true,
      },
    });
    if (!novel) {
      throw new Error("小说不存在，无法分析自动导演工作区。");
    }

    const [
      bookContract,
      storyMacro,
      characterCount,
      latestCharacter,
      volumePlans,
      chapterPlanCount,
      volumeChapterPlans,
      world,
      sourceKnowledgeDocument,
      continuationBookAnalysis,
      chapters,
      qualityReports,
      auditReports,
      storyStateSnapshots,
      payoffLedgerItems,
      characterResourceItems,
      activePipelineJob,
      activeDirectorRun,
      latestDirectorRun,
      persistedArtifacts,
    ] = await Promise.all([
      prisma.bookContract.findUnique({
        where: { novelId },
        select: {
          id: true,
          readingPromise: true,
          protagonistFantasy: true,
          coreSellingPoint: true,
          chapter3Payoff: true,
          chapter10Payoff: true,
          chapter30Payoff: true,
          escalationLadder: true,
          relationshipMainline: true,
          updatedAt: true,
        },
      }),
      prisma.storyMacroPlan.findUnique({
        where: { novelId },
        select: { id: true, updatedAt: true },
      }),
      prisma.character.count({ where: { novelId } }),
      prisma.character.findFirst({
        where: { novelId },
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.volumePlan.findMany({
        where: { novelId },
        select: {
          id: true,
          sortOrder: true,
          title: true,
          summary: true,
          mainPromise: true,
          openPayoffsJson: true,
          escalationMode: true,
          protagonistChange: true,
          nextVolumeHook: true,
          status: true,
          sourceVersionId: true,
          updatedAt: true,
        },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.volumeChapterPlan.count({
        where: {
          volume: { novelId },
        },
      }),
      prisma.volumeChapterPlan.findMany({
        where: {
          volume: { novelId },
        },
        select: {
          id: true,
          volumeId: true,
          chapterOrder: true,
          purpose: true,
          conflictLevel: true,
          revealLevel: true,
          mustAvoid: true,
          taskSheet: true,
          sceneCards: true,
          payoffRefsJson: true,
          updatedAt: true,
        },
        orderBy: { chapterOrder: "asc" },
      }),
      novel.worldId
        ? prisma.world.findUnique({
          where: { id: novel.worldId },
          select: { id: true, status: true, version: true, updatedAt: true },
        })
        : Promise.resolve(null),
      novel.sourceKnowledgeDocumentId
        ? prisma.knowledgeDocument.findUnique({
          where: { id: novel.sourceKnowledgeDocumentId },
          select: { id: true, activeVersionId: true, activeVersionNumber: true, updatedAt: true },
        })
        : Promise.resolve(null),
      novel.continuationBookAnalysisId
        ? prisma.bookAnalysis.findUnique({
          where: { id: novel.continuationBookAnalysisId },
          select: { id: true, documentVersionId: true, status: true, updatedAt: true },
        })
        : Promise.resolve(null),
      prisma.chapter.findMany({
        where: { novelId },
        select: {
          id: true,
          order: true,
          content: true,
          taskSheet: true,
          hook: true,
          expectation: true,
          riskFlags: true,
          repairHistory: true,
          generationState: true,
          chapterStatus: true,
          updatedAt: true,
        },
        orderBy: { order: "asc" },
        take: 120,
      }),
      prisma.qualityReport.findMany({
        where: { novelId },
        select: { id: true, chapterId: true, updatedAt: true },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      prisma.auditReport.findMany({
        where: { novelId },
        select: { id: true, chapterId: true, updatedAt: true },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      prisma.storyStateSnapshot.findMany({
        where: { novelId },
        select: {
          id: true,
          sourceChapterId: true,
          summary: true,
          rawStateJson: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      prisma.payoffLedgerItem.findMany({
        where: { novelId },
        select: {
          id: true,
          currentStatus: true,
          lastTouchedChapterId: true,
          setupChapterId: true,
          payoffChapterId: true,
          sourceRefsJson: true,
          evidenceJson: true,
          riskSignalsJson: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 60,
      }),
      prisma.characterResourceLedgerItem.findMany({
        where: { novelId },
        select: {
          id: true,
          status: true,
          ownerCharacterId: true,
          holderCharacterId: true,
          introducedChapterId: true,
          lastTouchedChapterId: true,
          riskSignalsJson: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 60,
      }),
      prisma.generationJob.findFirst({
        where: {
          novelId,
          status: { in: ["queued", "running"] },
        },
        select: { id: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.novelWorkflowTask.findFirst({
        where: {
          novelId,
          lane: "auto_director",
          status: { in: ["queued", "running", "waiting_approval"] },
        },
        select: { id: true },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.novelWorkflowTask.findFirst({
        where: {
          novelId,
          lane: "auto_director",
        },
        select: { id: true },
        orderBy: { updatedAt: "desc" },
      }),
      this.loadPersistedArtifacts(novelId),
    ]);

    const draftedChapters = chapters.filter((chapter) => (
      Boolean(chapter.content?.trim())
      || chapter.generationState !== "planned"
      || chapter.chapterStatus === "completed"
    ));
    const approvedChapterCount = chapters.filter((chapter) => (
      chapter.generationState === "approved"
      || chapter.generationState === "published"
      || chapter.chapterStatus === "completed"
    )).length;
    const pendingRepairChapterCount = chapters.filter((chapter) => (
      chapter.chapterStatus === "needs_repair"
      && !hasContinuableQualityLoopRiskFlags(chapter.riskFlags)
    )).length;
    const artifactInventory = buildDirectorWorkspaceArtifactInventory({
      novelId,
      hasWorldBinding: Boolean(novel.worldId),
      hasSourceKnowledge: Boolean(novel.sourceKnowledgeDocumentId),
      hasContinuationAnalysis: Boolean(novel.continuationBookAnalysisId),
      bookContract,
      storyMacro,
      characterCount,
      latestCharacter,
      volumePlans,
      chapterPlanCount,
      volumeChapterPlans,
      world,
      sourceKnowledgeDocument,
      continuationBookAnalysis,
      chapters,
      qualityReports,
      auditReports,
      storyStateSnapshots,
      payoffLedgerItems,
      characterResourceItems,
      draftedChapterCount: draftedChapters.length,
      pendingRepairChapterCount,
      persistedArtifacts,
    });

    return {
      novelId,
      novelTitle: novel.title,
      hasBookContract: Boolean(bookContract),
      hasStoryMacro: Boolean(storyMacro),
      hasCharacters: characterCount > 0,
      hasVolumeStrategy: volumePlans.length > 0,
      hasChapterPlan: artifactInventory.hasChapterPlan,
      chapterCount: chapters.length,
      draftedChapterCount: draftedChapters.length,
      approvedChapterCount,
      pendingRepairChapterCount,
      hasActivePipelineJob: Boolean(activePipelineJob),
      hasActiveDirectorRun: Boolean(activeDirectorRun),
      hasWorldBinding: Boolean(novel.worldId),
      hasSourceKnowledge: Boolean(novel.sourceKnowledgeDocumentId),
      hasContinuationAnalysis: Boolean(novel.continuationBookAnalysisId),
      activePipelineJobId: activePipelineJob?.id ?? null,
      activeDirectorTaskId: activeDirectorRun?.id ?? null,
      latestDirectorTaskId: latestDirectorRun?.id ?? null,
      ...artifactInventory.ledgerSummary,
      artifacts: artifactInventory.artifacts,
    };
  }

  private async loadPersistedArtifacts(novelId: string): Promise<DirectorArtifactRef[]> {
    const artifacts = await prisma.directorArtifact.findMany({
      where: { novelId },
      select: {
        id: true,
        runId: true,
        novelId: true,
        artifactType: true,
        targetType: true,
        targetId: true,
        version: true,
        status: true,
        source: true,
        contentTable: true,
        contentId: true,
        contentHash: true,
        schemaVersion: true,
        promptAssetKey: true,
        promptVersion: true,
        modelRoute: true,
        sourceStepRunId: true,
        protectedUserContent: true,
        artifactUpdatedAt: true,
        updatedAt: true,
        dependencies: {
          select: {
            dependsOnArtifactId: true,
            dependsOnVersion: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 300,
    });
    return artifacts.map((artifact) => normalizeDirectorArtifactRef({
      id: artifact.id,
      novelId: artifact.novelId,
      runId: artifact.runId,
      artifactType: artifact.artifactType as DirectorArtifactRef["artifactType"],
      targetType: artifact.targetType as DirectorArtifactRef["targetType"],
      targetId: artifact.targetId,
      version: artifact.version,
      status: artifact.status as DirectorArtifactRef["status"],
      source: artifact.source as DirectorArtifactRef["source"],
      contentRef: {
        table: artifact.contentTable,
        id: artifact.contentId,
      },
      contentHash: artifact.contentHash,
      schemaVersion: artifact.schemaVersion,
      promptAssetKey: artifact.promptAssetKey,
      promptVersion: artifact.promptVersion,
      modelRoute: artifact.modelRoute,
      sourceStepRunId: artifact.sourceStepRunId,
      protectedUserContent: artifact.protectedUserContent,
      dependsOn: artifact.dependencies.map((dependency) => ({
        artifactId: dependency.dependsOnArtifactId,
        version: dependency.dependsOnVersion,
      })),
      updatedAt: artifact.artifactUpdatedAt?.toISOString() ?? artifact.updatedAt.toISOString(),
    }));
  }
}
