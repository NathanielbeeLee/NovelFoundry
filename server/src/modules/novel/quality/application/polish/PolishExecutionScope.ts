import { randomUUID } from "node:crypto";
import { prisma } from "../../../../../db/prisma";
import { runInPolishScope, polishPrisma, type PolishScope } from "../../polishPersistence";
import { rawContentHash } from "../../domain/polish/PolishJournal";

export async function withPolishRevision<T>(input: { enabled: boolean; novelId: string; chapterId: string; jobId: string }, run: () => Promise<T>): Promise<T> {
  if (!input.enabled) return run();
  const chapter = await prisma.chapter.findFirst({ where: { id: input.chapterId, novelId: input.novelId } });
  if (!chapter?.content?.trim()) return run();
  const revision = await prisma.chapterPolishRevision.create({ data: {
    novelId: input.novelId, chapterId: input.chapterId, generationJobId: input.jobId,
    operationKey: `${input.jobId}:${input.chapterId}:${randomUUID()}`,
    beforeContent: chapter.content, beforeRawHash: rawContentHash(chapter.content), beforeChapterStateJson: JSON.stringify(chapter),
  } });
  const active: PolishScope = { revisionId: revision.id, novelId: input.novelId, chapterId: input.chapterId, expectedContent: chapter.content, nextSequence: 1, closed: false };
  let failure: unknown;
  try { return await runInPolishScope(active, run); }
  catch (error) {
    failure = error;
    // A failed review may leave usable committed prose. Finish its local state inside the same journal.
    if (!active.failure && active.expectedContent !== chapter.content) {
      try {
        await runInPolishScope(active, () => polishPrisma.chapter.updateMany({
          where: { id: chapter.id, novelId: input.novelId, content: active.expectedContent },
          data: { chapterStatus: "needs_repair" },
        }).then(() => undefined));
      } catch { /* The persistence boundary marks capture incomplete; preserve the original failure. */ }
    }
    throw error;
  }
  finally {
    active.closed = true;
    const current = await prisma.chapter.findFirst({ where: { id: chapter.id, novelId: input.novelId } });
    const captureComplete = !active.failure;
    await prisma.chapterPolishRevision.update({ where: { id: revision.id }, data: {
      status: failure ? "failed" : active.expectedContent === chapter.content ? "no_change" : "applied",
      afterContent: active.expectedContent, afterRawHash: rawContentHash(active.expectedContent),
      afterChapterStateJson: JSON.stringify({ version: 1, captureComplete, chapter: current }),
      lastError: active.failure ?? (failure instanceof Error ? failure.message : failure ? String(failure) : null), completedAt: new Date(),
    } });
  }
}
