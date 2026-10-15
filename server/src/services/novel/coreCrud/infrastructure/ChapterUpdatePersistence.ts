import type { PrismaClient } from "@prisma/client";
import type { ChapterSaveConflict } from "@novelfoundry/shared/types/novel";
import { AppError } from "../../../../middleware/errorHandler";
import type { ChapterUpdateInput } from "../../novelCoreShared";

export class ChapterSaveConflictError extends AppError {
  constructor(readonly conflict: ChapterSaveConflict) {
    super("章节正文有其他修改。你的草稿已保留，请对照后再保存。", 409);
  }
}

/** Missing preconditions fail closed for prose; metadata-only legacy writes remain valid. */
export async function persistChapterUpdate(
  db: Pick<PrismaClient, "$transaction">,
  novelId: string,
  chapterId: string,
  input: ChapterUpdateInput,
) {
  const { expectedContent, ...data } = input;
  const writesContent = typeof input.content === "string";
  if (writesContent && expectedContent === undefined) {
    throw new AppError("保存正文需要原文版本。请保留草稿并刷新应用后重试。", 428);
  }
  return db.$transaction(async (tx) => {
    // The conditional UPDATE acquires the write lock; no read/check/write gap.
    const result = await tx.chapter.updateMany({
      where: { id: chapterId, novelId, ...(writesContent ? { content: expectedContent } : {}) },
      data,
    });
    const chapter = await tx.chapter.findFirst({ where: { id: chapterId, novelId } });
    if (!chapter) throw new AppError("章节不存在。", 404);
    if (result.count !== 1) {
      throw new ChapterSaveConflictError({
        code: "CHAPTER_CONTENT_CONFLICT",
        chapterId,
        currentContent: chapter.content,
        updatedAt: chapter.updatedAt.toISOString(),
      });
    }
    return chapter;
  });
}
