import { prisma } from "../../../../../db/prisma";
import { AppError } from "../../../../../middleware/errorHandler";
import { createVerifiedNovelBackup } from "../../../export/backup";
import type { ChapterPolishRevision, ChapterPolishMutation } from "@prisma/client";
import type { PolishRevisionDetail, PolishRevisionSummary, PolishUndoEligibility, PolishRevisionPage } from "@novelfoundry/shared/types/polishHistory";
import { captureComplete, hasActivePolishWork, journalMatchesCurrent, undoConflict, undoJournal } from "../../infrastructure/polish/PolishUndoStore";

type RevisionRow = ChapterPolishRevision & { chapter: { order: number; content: string | null }; mutations?: ChapterPolishMutation[] };
export class PolishRevisionService {
  private async eligibility(row: RevisionRow, active: boolean): Promise<PolishUndoEligibility> {
    if (row.status === "undone") return { allowed: false, reason: "already_undone" };
    if (!captureComplete(row.afterChapterStateJson) || !["applied", "failed"].includes(row.status) || row.beforeContent === row.afterContent) return { allowed: false, reason: "incomplete_revision" };
    if (row.chapter.content !== row.afterContent) return { allowed: false, reason: "content_changed" };
    if (active) return { allowed: false, reason: "active_task" };
    if (!row.mutations) return { allowed: false, reason: "review_required" };
    if (!await journalMatchesCurrent(row.mutations)) return { allowed: false, reason: "derived_state_changed" };
    return { allowed: true };
  }
  private async summary(row: RevisionRow, active: boolean): Promise<PolishRevisionSummary> {
    return { id: row.id, novelId: row.novelId, chapterId: row.chapterId, chapterOrder: row.chapter.order, generationJobId: row.generationJobId,
      status: row.status as PolishRevisionSummary["status"], changed: row.afterContent != null && row.beforeContent !== row.afterContent,
      createdAt: row.createdAt.toISOString(), undoneAt: row.undoneAt?.toISOString() ?? null, undoEligibility: await this.eligibility(row, active) };
  }
  async list(novelId: string, jobId?: string, cursor?: string): Promise<PolishRevisionPage> {
    const rows = await prisma.chapterPolishRevision.findMany({ where: { novelId, ...(jobId ? { generationJobId: jobId } : {}) }, take: 31, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], include: { chapter: { select: { order: true, content: true } } } });
    const active = await hasActivePolishWork(novelId);
    const items = await Promise.all(rows.slice(0, 30).map((row) => this.summary(row, active)));
    return { items, nextCursor: rows.length > 30 ? items[items.length - 1].id : null };
  }
  async detail(novelId: string, id: string): Promise<PolishRevisionDetail | null> {
    const row = await prisma.chapterPolishRevision.findFirst({ where: { id, novelId }, include: { chapter: { select: { order: true, content: true } }, mutations: { orderBy: { sequence: "asc" } } } });
    if (!row) return null;
    return { ...await this.summary(row, await hasActivePolishWork(novelId)), beforeContent: row.beforeContent, afterContent: row.afterContent,
      beforeRawHash: row.beforeRawHash, afterRawHash: row.afterRawHash, mutationCount: row.mutations.length, currentMatchesAfter: row.afterContent === row.chapter.content };
  }
  async undo(novelId: string, id: string, expectedAfterHash: string) {
    const detail = await this.detail(novelId, id);
    if (!detail) throw new AppError("润色修订不存在。", 404);
    if (detail.status === "undone") return { chapterId: detail.chapterId, status: "undone" as const, artifactRefreshStatus: "queued" as const };
    if (!detail.undoEligibility.allowed || detail.afterRawHash !== expectedAfterHash) undoConflict(detail.undoEligibility.reason ?? "content_changed");
    // The backup facade writes, reads back, hashes and validates an actual portable file before returning.
    const backup = await createVerifiedNovelBackup(novelId, `before-polish-undo:${id}`);
    if (!backup.path || !backup.digest || backup.bytes <= 0) throw new AppError("撤销前备份未通过核验，正文保持不变。", 409);
    try { return await undoJournal({ novelId, revisionId: id, expectedAfterHash, backup }); }
    catch (error) {
      if (error instanceof AppError) throw error;
      if (error && typeof error === "object" && "code" in error && ["P2002", "P2003", "P2025", "P2034"].includes(String(error.code))) undoConflict("derived_state_changed");
      throw error;
    }
  }
}
