import { prisma } from "../../../../db/prisma";
import { buildContentHash } from "../../../novel/artifacts/persistence";
import type { RagOwnerType, RetrievedChunk } from "../../types";
import { buildSummarySourceHash } from "../../indexing/sourceIdentity";

function readMetadata(value: string | null | undefined): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

/** Qdrant is an acceleration index; only committed local rows can enter novel context. */
export async function filterCurrentRagChunks(chunks: RetrievedChunk[], tenantId: string): Promise<RetrievedChunk[]> {
  if (!chunks.length) return [];
  const records = await prisma.knowledgeChunk.findMany({
    where: { id: { in: Array.from(new Set(chunks.map((chunk) => chunk.id))) }, tenantId },
  });
  const recordsById = new Map(records.map((record) => [record.id, record]));
  const chapterIds = Array.from(new Set(records
    .filter((record) => record.ownerType === "chapter" || record.ownerType === "chapter_summary")
    .map((record) => record.ownerId)));
  const [chapters, summaries] = chapterIds.length ? await Promise.all([
    prisma.chapter.findMany({ where: { id: { in: chapterIds } }, select: { id: true, novelId: true, content: true } }),
    prisma.chapterSummary.findMany({ where: { chapterId: { in: chapterIds } }, select: {
      chapterId: true, novelId: true, sourceContentHash: true,
      summary: true, keyEvents: true, characterStates: true, hook: true,
    } }),
  ]) : [[], []];
  const chapterSources = new Map(chapters.filter((chapter) => chapter.content?.trim()).map((chapter) => [chapter.id, {
    novelId: chapter.novelId, hash: buildContentHash(chapter.content ?? ""),
  }]));
  const summarySources = new Map(summaries.map((summary) => [summary.chapterId, summary]));
  return chunks.flatMap((chunk) => {
    const record = recordsById.get(chunk.id);
    if (!record || record.ownerType !== chunk.ownerType || record.ownerId !== chunk.ownerId
      || (record.novelId ?? undefined) !== chunk.novelId || (record.worldId ?? undefined) !== chunk.worldId) return [];
    const metadata = readMetadata(record.metadataJson);
    if (record.ownerType === "chapter" || record.ownerType === "chapter_summary") {
      const source = chapterSources.get(record.ownerId);
      if (!source || source.novelId !== record.novelId || metadata.sourceContentHash !== source.hash) return [];
      if (record.ownerType === "chapter_summary") {
        const summary = summarySources.get(record.ownerId);
        if (!summary || summary.novelId !== source.novelId || summary.sourceContentHash !== source.hash
          || metadata.sourceSummaryHash !== buildSummarySourceHash(summary)) return [];
      }
    }
    return [{
      ...chunk,
      ownerType: record.ownerType as RagOwnerType,
      title: record.title ?? undefined,
      chunkText: record.chunkText,
      chunkOrder: record.chunkOrder,
      metadataJson: record.metadataJson ?? undefined,
      contextPrefix: typeof metadata.contextPrefix === "string" ? metadata.contextPrefix : undefined,
    }];
  });
}
