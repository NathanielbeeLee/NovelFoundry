import { WHOLE_BOOK_REVIEW_RUN_KIND } from "@novelfoundry/shared/types/wholeBookReview";
import { prisma } from "../../../../db/prisma";

export const WHOLE_BOOK_REVIEW_RUN_MARKER = WHOLE_BOOK_REVIEW_RUN_KIND;
export const WHOLE_BOOK_REVIEW_RUN_STALE_MS = 30 * 60 * 1000;

export interface StoredWholeBookReviewRunPayload {
  kind: typeof WHOLE_BOOK_REVIEW_RUN_MARKER;
  status: "running" | "failed";
  startOrder: number;
  endOrder: number;
  sourceRevision: string;
  startedAt: string;
  failureMessage?: string;
}

export interface ActiveWholeBookReviewRun {
  id: string;
  novelId: string;
  startOrder: number;
  endOrder: number;
  startedAt: string;
  updatedAt: Date;
}

export function parseWholeBookReviewRunPayload(value: string | null | undefined): StoredWholeBookReviewRunPayload | null {
  try {
    const payload = JSON.parse(value ?? "") as Partial<StoredWholeBookReviewRunPayload>;
    if (
      payload.kind !== WHOLE_BOOK_REVIEW_RUN_MARKER
      || (payload.status !== "running" && payload.status !== "failed")
      || typeof payload.startOrder !== "number"
      || typeof payload.endOrder !== "number"
      || typeof payload.sourceRevision !== "string"
      || typeof payload.startedAt !== "string"
    ) {
      return null;
    }
    return payload as StoredWholeBookReviewRunPayload;
  } catch {
    return null;
  }
}

export async function findActiveWholeBookReviewRun(novelId: string): Promise<ActiveWholeBookReviewRun | null> {
  const rows = await prisma.qualityReport.findMany({
    where: { novelId, chapterId: null },
    select: { id: true, novelId: true, issues: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
  const staleCutoff = Date.now() - WHOLE_BOOK_REVIEW_RUN_STALE_MS;
  for (const row of rows) {
    const payload = parseWholeBookReviewRunPayload(row.issues);
    if (payload?.status !== "running" || row.updatedAt.getTime() < staleCutoff) {
      continue;
    }
    return {
      id: row.id,
      novelId: row.novelId,
      startOrder: payload.startOrder,
      endOrder: payload.endOrder,
      startedAt: payload.startedAt,
      updatedAt: row.updatedAt,
    };
  }
  return null;
}

export function rangesOverlap(
  left: { startOrder: number; endOrder: number },
  right: { startOrder: number; endOrder: number },
): boolean {
  return left.startOrder <= right.endOrder && right.startOrder <= left.endOrder;
}
