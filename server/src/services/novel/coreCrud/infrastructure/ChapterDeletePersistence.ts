import type { Prisma, PrismaClient } from "@prisma/client";
import { AppError } from "../../../../middleware/errorHandler";
import { lockProjectionSourceRow } from "../../../../modules/novel/quality/sourceRowLock";

export async function deleteEmptyManualChapter(
  db: Pick<PrismaClient, "$transaction">, novelId: string, chapterId: string,
  enqueueDeleted: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<void> {
  await db.$transaction(async (tx) => {
    if (await lockProjectionSourceRow(tx, "chapter", chapterId, novelId) !== 1) throw new AppError("章节不存在。", 404);
    const chapter = await tx.chapter.findFirst({
      where: { id: chapterId, novelId },
      select: { content: true, generationState: true, chapterStatus: true, expectation: true,
        taskSheet: true, sceneCards: true, repairHistory: true, riskFlags: true },
    });
    if (!chapter) throw new AppError("章节不存在。", 404);
    const removable = chapter.generationState === "planned"
      && (chapter.chapterStatus ?? "unplanned") === "unplanned"
      && !chapter.content?.trim() && !chapter.expectation?.trim() && !chapter.taskSheet?.trim()
      && !chapter.sceneCards?.trim() && !chapter.repairHistory?.trim() && !chapter.riskFlags?.trim();
    if (!removable) throw new AppError("只能移除尚未进入写作或规划流程的空白手动章节。", 409);
    const deleted = await tx.chapter.deleteMany({ where: { id: chapterId, novelId } });
    if (deleted.count !== 1) throw new AppError("章节不存在。", 404);
    // A queue failure rolls back deletion; no index event can precede a refused delete.
    await enqueueDeleted(tx);
  });
}
