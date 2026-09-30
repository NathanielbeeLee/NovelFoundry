import { RagIndexStore } from "../infrastructure/RagIndexStore";
import { prisma } from "../../../../db/prisma";
import { ragConfig } from "../../../../config/rag";
import { getRagEmbeddingSettings } from "../../../settings/RagSettingsService";
import { EmbeddingService } from "../../EmbeddingService";
import { VectorStoreService } from "../../VectorStoreService";
import { RagContextualChunkService, type RagContextualChunkDocument } from "../../RagContextualChunkService";
import { resolveEmbeddingChunkTokenBudget } from "../../embeddingModelLimits";
import type { RagOwnerType, RagSourceDocument } from "../../types";
import type { RagPreChunk } from "../../chunkFacets";
import { runWithConcurrency } from "../../utils";
import type { RagJobProgressSnapshot } from "../../RagIndexService";
import { RagSourceDocumentLoader } from "../infrastructure/RagSourceDocumentLoader";
import { buildChunkCandidates } from "../domain/RagChunkPreparation";

interface RagIndexJobPorts {
  parseJobPayload(payload: string | null): { preChunks?: RagPreChunk[] };
  assertJobNotCancelled(jobId: string): Promise<void>;
  updateJobProgress(jobId: string, progress: Omit<RagJobProgressSnapshot, "updatedAt">): Promise<void>;
}
export class RagOwnerIndexingService {
  private readonly indexStore: RagIndexStore;
  private readonly sourceLoader = new RagSourceDocumentLoader();
  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStoreService: VectorStoreService,
    private readonly contextualChunkService: RagContextualChunkService,
    private readonly jobs: RagIndexJobPorts,
  ) { this.indexStore = new RagIndexStore(vectorStoreService); }
  private async embedTextsInBatches(
    texts: string[],
    onProgress?: (payload: { processed: number; total: number }) => Promise<void>,
  ): Promise<{ vectors: number[][]; provider: string; model: string }> {
    if (texts.length === 0) {
      return { vectors: [], provider: ragConfig.embeddingProvider, model: ragConfig.embeddingModel };
    }
    const batchSize = ragConfig.embeddingBatchSize;
    const concurrency = ragConfig.embeddingConcurrency;
    const vectors: number[][] = new Array(texts.length);
    let provider = ragConfig.embeddingProvider;
    let model = ragConfig.embeddingModel;
    let processed = 0;
    let lastReportPercent = 0;

    const batches: { start: number; texts: string[] }[] = [];
    for (let cursor = 0; cursor < texts.length; cursor += batchSize) {
      batches.push({ start: cursor, texts: texts.slice(cursor, cursor + batchSize) });
    }

    await runWithConcurrency(batches, concurrency, async (batch) => {
      const result = await this.embeddingService.embedTexts(batch.texts);
      provider = result.provider;
      model = result.model;
      for (let i = 0; i < result.vectors.length; i += 1) {
        vectors[batch.start + i] = result.vectors[i];
      }
      processed += batch.texts.length;

      if (onProgress) {
        const percent = texts.length > 0 ? processed / texts.length : 1;
        if (percent - lastReportPercent >= 0.03 || processed >= texts.length) {
          lastReportPercent = percent;
          await onProgress({ processed: Math.min(processed, texts.length), total: texts.length });
        }
      }
    });

    return { vectors, provider, model };
  }

  private buildContextualDocumentMap(documents: RagSourceDocument[]): Map<string, RagContextualChunkDocument> {
    return new Map(documents.map((document) => [
      `${document.ownerType}:${document.ownerId}`,
      {
        ownerType: document.ownerType,
        ownerId: document.ownerId,
        title: document.title,
        novelId: document.novelId,
        worldId: document.worldId,
        metadata: document.metadata,
      },
    ]));
  }

  async deleteOwnerChunks(
    ownerType: RagOwnerType,
    ownerId: string,
    tenantId: string,
    jobId?: string,
  ): Promise<{ deleted: number }> {
    if (jobId) {
      await this.jobs.assertJobNotCancelled(jobId);
    }
    const existing = await prisma.knowledgeChunk.findMany({
      where: { tenantId, ownerType, ownerId },
      select: { id: true },
    });
    if (existing.length === 0) {
      return { deleted: 0 };
    }
    if (jobId) {
      await this.jobs.updateJobProgress(jobId, {
        stage: "deleting_existing",
        label: "清理旧索引",
        detail: `正在删除 ${existing.length} 条旧分块。`,
        current: existing.length,
        total: existing.length,
        documents: 0,
        chunks: existing.length,
        percent: 0.8,
      });
    }
    const ids = existing.map((item) => item.id);
    await this.vectorStoreService.deletePoints(ids);
    await prisma.knowledgeChunk.deleteMany({
      where: { tenantId, ownerType, ownerId, id: { in: ids } },
    });
    return { deleted: existing.length };
  }

  async upsertOwnerChunks(
    ownerType: RagOwnerType,
    ownerId: string,
    tenantId: string,
    jobId: string,
  ): Promise<{ chunks: number }> {
    await this.jobs.assertJobNotCancelled(jobId);
    await this.jobs.updateJobProgress(jobId, {
      stage: "loading_source",
      label: "读取文档",
      detail: "正在读取知识库文档内容。",
      documents: 0,
      chunks: 0,
      percent: 0.05,
    });
    const jobPayload = this.jobs.parseJobPayload((await prisma.ragIndexJob.findUnique({
      where: { id: jobId },
      select: { payloadJson: true },
    }))?.payloadJson ?? null);
    const docs = await this.sourceLoader.loadSourceDocuments(ownerType, ownerId, tenantId, jobPayload);
    await this.jobs.assertJobNotCancelled(jobId);
    if (docs.length === 0 && (ownerType === "chapter" || ownerType === "chapter_summary")) {
      // A stale/missing chapter source must not erase a concurrently committed newer index.
      // Retrieval filters obsolete versions; a fresh source job can rebuild later.
      await this.jobs.updateJobProgress(jobId, {
        stage: "completed", label: "等待有效章节内容", documents: 0, chunks: 0, percent: 1,
      });
      return { chunks: 0 };
    }
    if (docs.length === 0) {
      await this.jobs.updateJobProgress(jobId, {
        stage: "deleting_existing",
        label: "清理旧索引",
        detail: "当前没有可索引内容，正在清理旧索引。",
        documents: 0,
        chunks: 0,
        percent: 0.3,
      });
      await this.deleteOwnerChunks(ownerType, ownerId, tenantId, jobId);
      await this.jobs.updateJobProgress(jobId, {
        stage: "completed",
        label: "索引完成",
        detail: "没有可索引内容，旧索引已清理。",
        documents: 0,
        chunks: 0,
        percent: 1,
      });
      return { chunks: 0 };
    }

    const embeddingSettings = await getRagEmbeddingSettings();
    const embeddingTokenBudget = resolveEmbeddingChunkTokenBudget(
      embeddingSettings.embeddingProvider,
      embeddingSettings.embeddingModel,
    );

    // 知识库文档索引时，预加载角色候选名用于 chunk facet 自动提取
    // KnowledgeDocument 没有直接 novelId，取该租户下所有角色名做关键词匹配（数量有限，代价可忽略）
    let knownCharacterNames: string[] = [];
    if (ownerType === "knowledge_document") {
      const chars = await prisma.character.findMany({
        select: { name: true },
        take: 300,
        orderBy: { updatedAt: "desc" },
      });
      knownCharacterNames = chars.map((c) => c.name).filter((n) => n.length >= 2);
    }

    const candidates = buildChunkCandidates(docs, embeddingSettings.embeddingProvider, embeddingSettings.embeddingModel, {
      maxTokens: embeddingTokenBudget,
      knownCharacterNames,
    });
    await this.jobs.updateJobProgress(jobId, {
      stage: "chunking",
      label: "切分分块",
      detail: `已读取 ${docs.length} 份文档，生成 ${candidates.length} 个分块。`,
      current: candidates.length,
      total: candidates.length,
      documents: docs.length,
      chunks: candidates.length,
      percent: 0.15,
    });
    await this.contextualChunkService.applyToCandidates({
      candidates,
      documentsByOwner: this.buildContextualDocumentMap(docs),
    });
    const splitTexts = candidates.map((item) => item.searchText ?? item.chunkText);
    await this.jobs.assertJobNotCancelled(jobId);
    const embedding = await this.embedTextsInBatches(splitTexts, async ({ processed, total }) => {
      await this.jobs.updateJobProgress(jobId, {
        stage: "embedding",
        label: "生成向量",
        detail: `已生成 ${processed}/${total} 个向量（${ragConfig.embeddingConcurrency} 并发）。`,
        current: processed,
        total,
        documents: docs.length,
        chunks: total,
        percent: 0.15 + (total > 0 ? (processed / total) * 0.5 : 0),
      });
    });
    await this.jobs.assertJobNotCancelled(jobId);
    for (const candidate of candidates) {
      candidate.embedProvider = embedding.provider;
      candidate.embedModel = embedding.model;
    }
    if (candidates.length === 0 && (ownerType === "chapter" || ownerType === "chapter_summary")) {
      await this.jobs.updateJobProgress(jobId, {
        stage: "completed", label: "没有可索引分块", documents: docs.length, chunks: 0, percent: 1,
      });
      return { chunks: 0 };
    }
    if (candidates.length === 0) {
      await this.jobs.updateJobProgress(jobId, {
        stage: "deleting_existing",
        label: "清理旧索引",
        detail: "切分后没有可写入的分块，正在清理旧索引。",
        documents: docs.length,
        chunks: 0,
        percent: 0.3,
      });
      await this.deleteOwnerChunks(ownerType, ownerId, tenantId, jobId);
      await this.jobs.updateJobProgress(jobId, {
        stage: "completed",
        label: "索引完成",
        detail: "切分后没有可写入的分块。",
        documents: docs.length,
        chunks: 0,
        percent: 1,
      });
      return { chunks: 0 };
    }
    if (embedding.vectors.length !== candidates.length) {
      throw new Error("RAG embedding 数量与 chunk 数量不一致。");
    }

    const vectorSize = embedding.vectors[0]?.length ?? 0;
    await this.jobs.updateJobProgress(jobId, {
      stage: "ensuring_collection",
      label: "校验集合",
      detail: `正在校验向量集合，目标维度 ${vectorSize}。`,
      current: candidates.length,
      total: candidates.length,
      documents: docs.length,
      chunks: candidates.length,
      percent: 0.7,
    });
    await this.jobs.assertJobNotCancelled(jobId);
    await this.vectorStoreService.ensureCollection(vectorSize);

    await this.jobs.updateJobProgress(jobId, {
      stage: "upserting_vectors", label: "写入索引", documents: docs.length,
      chunks: candidates.length, percent: 0.8,
    });
    await this.jobs.assertJobNotCancelled(jobId);
    await this.indexStore.replaceOwnerChunks({ ownerType, ownerId, tenantId, candidates, vectors: embedding.vectors });

    await this.jobs.updateJobProgress(jobId, {
      stage: "completed",
      label: "索引完成",
      detail: `索引已完成，共 ${candidates.length} 个分块。`,
      current: candidates.length,
      total: candidates.length,
      documents: docs.length,
      chunks: candidates.length,
      percent: 1,
    });
    return { chunks: candidates.length };
  }

}
