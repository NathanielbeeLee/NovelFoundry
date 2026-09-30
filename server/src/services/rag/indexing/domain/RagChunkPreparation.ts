import { ragConfig } from "../../../../config/rag";
import type { RagSourceDocument, RagChunkCandidate } from "../../types";
import { buildChunkId, computeChunkHash, estimateTokenCount, splitRagChunks } from "../../utils";
import { encodeFacetKeys, extractChapterAnchorFromChunk, extractCharacterRolesFromChunk, type RagChunkAnchor, type RagChunkFacets } from "../../chunkFacets";

function isCjk(text: string): boolean {
  return /[\u4E00-\u9FFF]/.test(text);
}

interface SourcePiece {
  chunkText: string;
  facets?: import("../../chunkFacets").RagChunkFacets;
  anchor?: RagChunkAnchor;
  metadata?: Record<string, unknown>;
}

export function buildChunkCandidates(
  documents: RagSourceDocument[],
  embedProvider: string,
  embedModel: string,
  options?: { maxTokens?: number | null; knownCharacterNames?: string[] },
): RagChunkCandidate[] {
  const candidateNames = options?.knownCharacterNames ?? [];
  const candidates: RagChunkCandidate[] = [];
  for (const document of documents) {
    const isKnowledgeDoc = document.ownerType === "knowledge_document";
    const sourcePieces: SourcePiece[] = document.preChunks?.length
      ? document.preChunks.flatMap((preChunk) => {
        const pieces = splitRagChunks(preChunk.chunkText, ragConfig.chunkSize, ragConfig.chunkOverlap, {
          maxTokens: options?.maxTokens ?? null,
        });
        return pieces.map((chunkText) => ({
          chunkText,
          facets: preChunk.facets,
          anchor: preChunk.anchor,
          metadata: preChunk.metadata,
        }));
      })
      : splitRagChunks(document.content, ragConfig.chunkSize, ragConfig.chunkOverlap, {
        maxTokens: options?.maxTokens ?? null,
      }).map((chunkText): SourcePiece => {
        if (!isKnowledgeDoc) {
          return { chunkText };
        }
        // 知识库文档：自动从 chunk 正文抽取章节锚点和角色名，填充 facets
        const chapterAnchors = extractChapterAnchorFromChunk(chunkText);
        const characterRoles = candidateNames.length > 0
          ? extractCharacterRolesFromChunk(chunkText, candidateNames)
          : [];
        const facets: RagChunkFacets = {};
        if (chapterAnchors.length > 0) {
          facets.chapterAnchor = chapterAnchors;
        }
        if (characterRoles.length > 0) {
          facets.characterRole = characterRoles;
        }
        return {
          chunkText,
          facets: Object.keys(facets).length > 0 ? facets : undefined,
        };
      });
    for (const piece of sourcePieces) {
      const chunkText = piece.chunkText;
      const chunkOrder = candidates.filter((item) =>
        item.ownerType === document.ownerType && item.ownerId === document.ownerId).length;
      const metadata = {
        ...(document.metadata ?? {}),
        ...(piece.metadata ?? {}),
        ...(piece.facets && Object.keys(piece.facets).length > 0 ? { facets: piece.facets } : {}),
        ...(piece.anchor ? { anchor: piece.anchor } : {}),
      };
      const facetKeys = encodeFacetKeys(piece.facets);
      const chapterAnchor = piece.anchor?.chapterIndex !== undefined
        ? String(piece.anchor.chapterIndex)
        : piece.facets?.chapterAnchor?.[0] ?? null;
      const chunkHash = computeChunkHash(
        `${document.tenantId}|${document.ownerType}|${document.ownerId}|${chunkOrder}|${chunkText}`,
      );
      candidates.push({
        id: buildChunkId(),
        ownerType: document.ownerType,
        ownerId: document.ownerId,
        tenantId: document.tenantId,
        title: document.title,
        chunkText,
        chunkHash,
        chunkOrder,
        tokenEstimate: estimateTokenCount(chunkText),
        language: isCjk(chunkText) ? "zh" : "en",
        metadataJson: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : undefined,
        facets: piece.facets,
        facetKeys,
        chapterAnchor,
        embedProvider,
        embedModel,
        embedVersion: ragConfig.embeddingVersion,
        novelId: document.novelId,
        worldId: document.worldId,
      });
    }
  }
  return candidates;
}
