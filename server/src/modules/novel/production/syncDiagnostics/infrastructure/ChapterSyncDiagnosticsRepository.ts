import { prisma } from "../../../../../db/prisma";
import { ragConfig } from "../../../../../config/rag";
import { buildContentHash } from "../../../../../services/novel/artifacts/persistence";
import { hashContent } from "../../../../../services/novel/runtime/timelineFinalization/sourceIdentity";
import { sourceRevision } from "../domain/sourceIdentity";
import type { ChapterSyncDiagnosticsReader, ChapterSyncSnapshot } from "../domain/contracts";

const chapterSelect = { id: true, novelId: true, content: true, updatedAt: true } as const;
const summarySelect = {
  summary: true, keyEvents: true, characterStates: true, hook: true,
  sourceContentHash: true, updatedAt: true,
} as const;
const checkpointSelect = {
  contentHash: true, artifactType: true, syncMode: true,
  status: true, metadataJson: true, updatedAt: true,
} as const;
const CHUNK_LIMIT = 500;

/** SELECT-only snapshot. No source lock, AI invocation, queue creation, or repair. */
export class ChapterSyncDiagnosticsRepository implements ChapterSyncDiagnosticsReader {
  async readSnapshot(novelId: string, chapterId: string): Promise<ChapterSyncSnapshot | null> {
    return prisma.$transaction(async (tx) => {
      const chapter = await tx.chapter.findFirst({ where: { id: chapterId, novelId }, select: chapterSelect });
      if (!chapter) return null;
      const summary = await tx.chapterSummary.findFirst({ where: { novelId, chapterId }, select: summarySelect });
      const revision = sourceRevision(chapter, summary);
      const checkpoints = [];
      for (const [artifactType, contentHash] of [
        ["artifact_delta", buildContentHash(chapter.content ?? "")],
        ["timeline_finalization", hashContent((chapter.content ?? "").trim())],
      ]) {
        const current = await tx.chapterArtifactSyncCheckpoint.findMany({
          where: { novelId, chapterId, artifactType, contentHash },
          select: checkpointSelect, orderBy: { updatedAt: "desc" }, take: 20,
        });
        checkpoints.push(...current);
        if (!current.length) {
          const historical = await tx.chapterArtifactSyncCheckpoint.findFirst({
            where: { novelId, chapterId, artifactType }, select: checkpointSelect, orderBy: { updatedAt: "desc" },
          });
          if (historical) checkpoints.push(historical);
        }
      }
      const jobs = [];
      const chunks = [];
      const truncatedChunkOwners: string[] = [];
      for (const ownerType of ["chapter", "chapter_summary"] as const) {
        const where = { tenantId: ragConfig.defaultTenantId, ownerType, ownerId: chapterId };
        const select = { ownerType: true, status: true, payloadJson: true, updatedAt: true } as const;
        // Match the full JSON string value, then verify parsed equality in the projection.
        const currentJobs = await tx.ragIndexJob.findMany({
          where: { ...where, jobType: "upsert", payloadJson: { contains: JSON.stringify(revision) } },
          select, orderBy: { updatedAt: "desc" }, take: 10,
        });
        jobs.push(...currentJobs);
        if (!currentJobs.length) {
          const latest = await tx.ragIndexJob.findFirst({ where: { ...where, jobType: "upsert" }, select, orderBy: { updatedAt: "desc" } });
          if (latest) jobs.push(latest);
        }
        const ownerChunks = await tx.knowledgeChunk.findMany({
          where: { ...where, novelId }, select: { ownerType: true, metadataJson: true, indexedAt: true },
          orderBy: { chunkOrder: "asc" }, take: CHUNK_LIMIT + 1,
        });
        if (ownerChunks.length > CHUNK_LIMIT) truncatedChunkOwners.push(ownerType);
        chunks.push(...ownerChunks.slice(0, CHUNK_LIMIT));
      }
      return { chapter, summary, checkpoints, jobs, chunks, truncatedChunkOwners };
    }, { isolationLevel: "Serializable" });
  }

  async readSource(novelId: string, chapterId: string) {
    return prisma.$transaction(async (tx) => {
      const chapter = await tx.chapter.findFirst({ where: { id: chapterId, novelId }, select: chapterSelect });
      if (!chapter) return null;
      const summary = await tx.chapterSummary.findFirst({ where: { novelId, chapterId }, select: summarySelect });
      return { chapter, summary };
    }, { isolationLevel: "Serializable" });
  }
}
