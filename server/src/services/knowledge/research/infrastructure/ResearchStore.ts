import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { ResearchAnchor, ResearchSourceInput, ResearchSourceView } from "@novelfoundry/shared/types/knowledgeResearch";
import { RESEARCH_ADOPTION_LIMIT } from "@novelfoundry/shared/types/knowledgeResearch";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { researchContentHash, isResearchSourceFresh, isResearchFindingFresh, groundResearchFindings } from "../domain/researchPolicy";

const sourceInclude = { documentVersion: { include: { document: true } } } as const;
const findingInclude = { source: { include: sourceInclude } } as const;
type Finding = Prisma.KnowledgeResearchFindingGetPayload<{ include: typeof findingInclude }>;
function anchor(finding: Finding): ResearchAnchor {
  const source = finding.source;
  return {
    findingId: finding.id, sourceId: source.id, documentVersionId: source.documentVersionId,
    sourceTitle: source.title, sourceUrl: source.url, author: source.author,
    accessedAt: source.accessedAt?.toISOString() ?? null, reliabilityReason: source.reliabilityReason,
    contentHash: finding.contentHash, claim: finding.claim, quote: finding.quote,
    startOffset: finding.startOffset, endOffset: finding.endOffset, uncertainty: finding.uncertainty,
  };
}
export async function loadResearchDocument(documentId: string) {
  const document = await prisma.knowledgeDocument.findUnique({ where: { id: documentId }, include: { activeVersion: true } });
  if (!document?.activeVersion) throw new AppError("请先为资料选择有效版本。", 404);
  return document;
}
async function lockDocument(tx: Prisma.TransactionClient, documentId: string, versionId: string) {
  const document = await tx.knowledgeDocument.findUnique({ where: { id: documentId } });
  if (!document || document.status !== "enabled" || document.activeVersionId !== versionId) {
    throw new AppError("资料状态或版本已改变，请重新加载。", 409);
  }
  const locked = await tx.$executeRaw`UPDATE "KnowledgeDocument" SET "id" = "id"
    WHERE "id" = ${documentId} AND "activeVersionId" = ${versionId} AND "status" = 'enabled'`;
  if (locked !== 1) throw new AppError("资料状态或版本已改变，请重新加载。", 409);
}
export async function readResearchSource(documentId: string): Promise<ResearchSourceView | null> {
  const document = await prisma.knowledgeDocument.findUnique({ where: { id: documentId }, select: { activeVersionId: true } });
  if (!document) throw new AppError("资料不存在。", 404);
  if (!document.activeVersionId) return null;
  const source = await prisma.knowledgeResearchSource.findUnique({
    where: { documentVersionId: document.activeVersionId }, include: {
      ...sourceInclude, findings: { orderBy: { createdAt: "desc" }, include: { adoptions: { include: { novel: { select: { title: true } } } } } },
    },
  });
  if (!source) return null;
  return {
    id: source.id, documentVersionId: source.documentVersionId, title: source.title, url: source.url,
    author: source.author, accessedAt: source.accessedAt?.toISOString() ?? null,
    reliabilityReason: source.reliabilityReason, enabled: source.enabled, revision: source.revision,
    contentHash: source.contentHash, fresh: isResearchSourceFresh(source),
    findings: source.findings.map(finding => ({
      ...anchor({ ...finding, source }), fresh: isResearchFindingFresh(finding, source),
      adoptions: finding.adoptions.map(adoption => ({ novelId: adoption.novelId,
        novelTitle: adoption.novel.title, revokedAt: adoption.revokedAt?.toISOString() ?? null })),
    })),
  };
}
export async function saveResearchSource(documentId: string, input: ResearchSourceInput) {
  await prisma.$transaction(async tx => {
    await lockDocument(tx, documentId, input.documentVersionId);
    const version = await tx.knowledgeDocumentVersion.findUniqueOrThrow({ where: { id: input.documentVersionId } });
    const current = await tx.knowledgeResearchSource.findUnique({ where: { documentVersionId: version.id } });
    if ((current?.revision ?? null) !== input.expectedRevision) throw new AppError("来源说明已改变，请重新加载。", 409);
    const data = { title: input.title, url: input.url || null, author: input.author || null,
      accessedAt: input.accessedAt ? new Date(input.accessedAt) : null,
      reliabilityReason: input.reliabilityReason, enabled: input.enabled,
      contentHash: researchContentHash(version.content) };
    const unchanged = current && current.title === data.title && current.url === data.url && current.author === data.author
      && (current.accessedAt?.toISOString() ?? null) === (data.accessedAt?.toISOString() ?? null)
      && current.reliabilityReason === data.reliabilityReason && current.enabled === data.enabled && current.contentHash === data.contentHash;
    if (unchanged) return;
    const next = { ...data, revision: randomUUID() };
    await tx.knowledgeResearchSource.upsert({ where: { documentVersionId: version.id },
      create: { ...next, documentVersionId: version.id }, update: next });
  });
  return readResearchSource(documentId);
}
export async function loadExtractionSource(documentId: string, revision: string) {
  const document = await loadResearchDocument(documentId);
  const source = await prisma.knowledgeResearchSource.findUnique({ where: { documentVersionId: document.activeVersionId! }, include: sourceInclude });
  if (!source || source.revision !== revision || !isResearchSourceFresh(source)) {
    throw new AppError("来源已停用或改变，请重新加载来源说明。", 409);
  }
  return source;
}
export async function storeResearchFindings(documentId: string, sourceId: string, revision: string, content: string, raw: unknown) {
  const findings = groundResearchFindings(raw, content);
  await prisma.$transaction(async tx => {
    const original = await tx.knowledgeResearchSource.findUniqueOrThrow({ where: { id: sourceId } });
    await lockDocument(tx, documentId, original.documentVersionId);
    const locked = await tx.$executeRaw`UPDATE "KnowledgeResearchSource" SET "id" = "id"
      WHERE "id" = ${sourceId} AND "revision" = ${revision} AND "enabled" = true
        AND "contentHash" = ${researchContentHash(content)}`;
    if (locked !== 1) throw new AppError("提取期间来源已改变，请重新提取。", 409);
    const source = await tx.knowledgeResearchSource.findUniqueOrThrow({ where: { id: sourceId }, include: sourceInclude });
    if (!isResearchSourceFresh(source)) throw new AppError("原文已改变，请重新提取。", 409);
    const nextRevision = randomUUID();
    await tx.knowledgeResearchSource.update({ where: { id: sourceId }, data: { revision: nextRevision } });
    for (const finding of findings) await tx.knowledgeResearchFinding.create({ data: {
      ...finding, sourceId, sourceRevision: nextRevision, contentHash: source.contentHash,
    } });
  });
  return readResearchSource(documentId);
}
export async function setResearchAdoption(documentId: string, findingId: string, novelId: string, adopt: boolean) {
  await prisma.$transaction(async tx => {
    let finding = await tx.knowledgeResearchFinding.findUnique({ where: { id: findingId }, include: findingInclude });
    if (!finding || finding.source.documentVersion.documentId !== documentId) throw new AppError("没有找到该资料结论。", 404);
    if (adopt) {
      await lockDocument(tx, documentId, finding.source.documentVersionId);
      const source = finding.source;
      const locked = await tx.$executeRaw`UPDATE "KnowledgeResearchSource" SET "id" = "id"
        WHERE "id" = ${source.id} AND "revision" = ${source.revision} AND "enabled" = true`;
      if (locked !== 1) throw new AppError("来源已改变，请重新加载。", 409);
      finding = await tx.knowledgeResearchFinding.findUniqueOrThrow({ where: { id: findingId }, include: findingInclude });
      if (!isResearchFindingFresh(finding, finding.source)) throw new AppError("结论已失效，请从当前资料重新提取。", 409);
    }
    // Every adoption/revocation locks this novel before counting or writing, including across workers.
    const novel = await tx.novel.findUnique({ where: { id: novelId }, select: { id: true, updatedAt: true } });
    if (!novel) throw new AppError("小说不存在。", 404);
    await tx.$executeRaw`UPDATE "Novel" SET "id" = "id" WHERE "id" = ${novelId}`;
    if (adopt) {
      const rows = await tx.knowledgeResearchAdoption.findMany({ where: { novelId, revokedAt: null }, include: { finding: { include: findingInclude } } });
      const active = rows; // Stale selections still occupy a slot until explicitly revoked.
      if (!active.some(row => row.findingId === findingId) && active.length >= RESEARCH_ADOPTION_LIMIT) {
        throw new AppError(`每部小说最多采用 ${RESEARCH_ADOPTION_LIMIT} 条研究结论，请先撤销不需要的条目。`, 409);
      }
      await tx.knowledgeResearchAdoption.upsert({ where: { findingId_novelId: { findingId, novelId } },
        create: { findingId, novelId }, update: { revokedAt: null } });
    } else {
      await tx.knowledgeResearchAdoption.updateMany({ where: { findingId, novelId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
  });
  return readResearchSource(documentId);
}
export async function readResearchAnchors(novelId: string): Promise<ResearchAnchor[]> {
  const rows = await prisma.knowledgeResearchAdoption.findMany({
    where: { novelId, revokedAt: null }, orderBy: { createdAt: "asc" }, include: { finding: { include: findingInclude } },
  });
  const anchors = rows.filter(row => isResearchFindingFresh(row.finding, row.finding.source)).map(row => anchor(row.finding));
  if (anchors.length > RESEARCH_ADOPTION_LIMIT) throw new AppError("研究结论超过上限，请先撤销多余条目。", 409);
  return anchors;
}

export async function listResearchAdoptions(novelId: string) {
  const rows = await prisma.knowledgeResearchAdoption.findMany({ where: { novelId, revokedAt: null },
    orderBy: { createdAt: "asc" }, include: { finding: { include: findingInclude } } });
  return rows.map(row => ({ findingId: row.findingId, documentId: row.finding.source.documentVersion.documentId,
    sourceTitle: row.finding.source.title, claim: row.finding.claim,
    fresh: isResearchFindingFresh(row.finding, row.finding.source) }));
}
