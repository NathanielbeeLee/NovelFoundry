import { artifactPrisma as prisma, runWithChapterSource } from "../../../novel/artifacts/persistence";
import { VectorStoreService } from "../../VectorStoreService";
import type { RagChunkCandidate, RagOwnerType } from "../../types";
import { buildSummarySourceHash } from "../domain/RagSummarySourceIdentity";

export class RagIndexStore {
  constructor(private readonly vectorStoreService: VectorStoreService) {}

  async replaceOwnerChunks(input: {
    ownerType: RagOwnerType; ownerId: string; tenantId: string;
    candidates: RagChunkCandidate[]; vectors: number[][];
  }): Promise<void> {
    const { ownerType, ownerId, tenantId, candidates, vectors } = input;
    const newPoints = candidates.map((item, index) => ({
      id: item.id,
      vector: vectors[index],
      payload: {
        tenantId: item.tenantId,
        ownerType: item.ownerType,
        ownerId: item.ownerId,
        novelId: item.novelId,
        worldId: item.worldId,
        title: item.title,
        chunkText: item.chunkText,
        contextPrefix: item.contextPrefix,
        contextVersion: item.contextVersion,
        contextSourceHash: item.contextSourceHash,
        searchText: item.searchText,
        chunkHash: item.chunkHash,
        chunkOrder: item.chunkOrder,
        metadataJson: item.metadataJson,
        facetKeys: item.facetKeys,
        chapterAnchor: item.chapterAnchor,
        ...(item.facets ?? {}),
      },
    }));
    // Qdrant is staged first. Retrieval accepts only points backed by committed local rows.
    await this.vectorStoreService.upsertPoints(newPoints);
    let oldIds: string[] = [];
    const commit = () => prisma.$transaction(async (tx) => {
      if (ownerType === "chapter_summary") {
        const hashes = new Set(candidates.map((item) => JSON.parse(item.metadataJson ?? "{}").sourceSummaryHash));
        const summary = await tx.chapterSummary.findUnique({ where: { chapterId: ownerId } });
        if (!summary || summary.novelId !== candidates[0]?.novelId || hashes.size !== 1
          || !hashes.has(buildSummarySourceHash(summary))
          || summary.sourceContentHash !== JSON.parse(candidates[0]?.metadataJson ?? "{}").sourceContentHash) {
          throw new Error("Chapter summary changed while its index was being prepared.");
        }
        const locked = await tx.chapterSummary.updateMany({
          where: { chapterId: ownerId, updatedAt: summary.updatedAt, summary: summary.summary,
            keyEvents: summary.keyEvents, characterStates: summary.characterStates, hook: summary.hook,
            sourceContentHash: summary.sourceContentHash },
          data: { updatedAt: summary.updatedAt },
        });
        if (locked.count !== 1) throw new Error("Chapter summary changed before index commit.");
      }
      const oldChunks = await tx.knowledgeChunk.findMany({ where: { tenantId, ownerType, ownerId }, select: { id: true } });
      oldIds = oldChunks.map((item) => item.id);
      await tx.knowledgeChunk.createMany({
        data: candidates.map((item) => ({
          id: item.id,
          tenantId: item.tenantId,
          ownerType: item.ownerType,
          ownerId: item.ownerId,
          novelId: item.novelId ?? null,
          worldId: item.worldId ?? null,
          title: item.title ?? null,
          chunkText: item.chunkText,
          chunkHash: item.chunkHash,
          chunkOrder: item.chunkOrder,
          tokenEstimate: item.tokenEstimate,
          language: item.language,
          metadataJson: item.metadataJson ?? null,
          facetKeys: item.facetKeys ?? null,
          chapterAnchor: item.chapterAnchor ?? null,
          embedProvider: item.embedProvider,
          embedModel: item.embedModel,
          embedVersion: item.embedVersion,
          indexedAt: new Date(),
        })),
      });
      if (oldIds.length) await tx.knowledgeChunk.deleteMany({ where: { id: { in: oldIds } } });
    });
    try {
      if (ownerType === "chapter" || ownerType === "chapter_summary") {
        const hashes = new Set(candidates.map((item) => {
          try { return (JSON.parse(item.metadataJson ?? "{}") as { sourceContentHash?: unknown }).sourceContentHash; }
          catch { return undefined; }
        }));
        const contentHash = hashes.values().next().value;
        const novelId = candidates[0]?.novelId;
        if (hashes.size !== 1 || typeof contentHash !== "string" || !contentHash || !novelId) {
          throw new Error("Chapter indexing requires one verified source content hash.");
        }
        await runWithChapterSource({ novelId, chapterId: ownerId, contentHash }, commit);
      } else {
        await commit();
      }
    } catch (error) {
      await this.vectorStoreService.deletePoints(candidates.map((item) => item.id)).catch(() => {});
      throw error;
    }
    if (oldIds.length) await this.vectorStoreService.deletePoints(oldIds).catch(() => {});
  }
}
