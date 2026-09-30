import type { Prisma } from "@prisma/client";
import type { ReferenceStartRequest } from "@novelfoundry/shared/types/creationStudio";
import { BOOK_ANALYSIS_SECTIONS } from "@novelfoundry/shared/types/bookAnalysis";
import { prisma } from "../../../../../db/prisma";
import { AppError } from "../../../../../middleware/errorHandler";
import { contentFingerprint, type ReferenceSourceSnapshot } from "../domain/referenceStartContract";

export async function readReferenceSource(
  request: ReferenceStartRequest,
  db: Pick<Prisma.TransactionClient, "bookAnalysis"> = prisma,
): Promise<ReferenceSourceSnapshot> {
  const allowed = new Set(BOOK_ANALYSIS_SECTIONS.map((section) => section.key));
  const selected = [...new Set(request.sectionKeys)].sort();
  if (!selected.length || selected.some((key) => !allowed.has(key))) {
    throw new AppError("请至少选择一个有效的参考维度。", 400);
  }
  const row = await db.bookAnalysis.findUnique({
    where: { id: request.analysisId },
    select: {
      id: true, title: true, status: true, documentVersionId: true,
      sections: { select: { sectionKey: true, status: true, editedContent: true, aiContent: true, structuredDataJson: true } },
    },
  });
  if (!row || row.status !== "succeeded") throw new AppError("请选择已完成的拆书分析。", 409);
  const sections = selected.map((key) => {
    const section = row.sections.find((item) => item.sectionKey === key);
    if (!section || section.status !== "succeeded") throw new AppError("所选参考维度尚未完成，请调整选择。", 409);
    // User edits are authoritative; stale generated structure must not override them.
    const content = section.editedContent?.trim()
      || section.structuredDataJson?.trim() || section.aiContent?.trim();
    if (!content) throw new AppError("所选参考维度缺少内容，请调整选择。", 409);
    return { key, content };
  });
  if (sections.reduce((size, section) => size + section.content.length, 0) > 60_000) {
    throw new AppError("所选分析内容较多，请减少参考维度后重试。", 400);
  }
  return {
    analysisId: row.id, title: row.title, documentVersionId: row.documentVersionId,
    fingerprint: contentFingerprint({ analysisId: row.id, documentVersionId: row.documentVersionId, sections }),
    sections,
  };
}
