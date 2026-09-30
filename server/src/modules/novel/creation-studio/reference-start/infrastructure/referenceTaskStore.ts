import type { Prisma } from "@prisma/client";
import { prisma } from "../../../../../db/prisma";
import { AppError } from "../../../../../middleware/errorHandler";
import type { ReferenceTaskSeed } from "../domain/referenceStartContract";

export function parseReferenceSeed(json: string | null): ReferenceTaskSeed {
  return json ? JSON.parse(json) as ReferenceTaskSeed : {};
}

/** A task-row write serializes regeneration, publication and confirmation on both databases. */
export async function lockReferenceTask(tx: Prisma.TransactionClient, taskId: string) {
  const row = await tx.novelWorkflowTask.findUnique({ where: { id: taskId } });
  if (!row || row.lane !== "creation_studio") throw new AppError("参考创作任务不存在。", 404);
  const seed = parseReferenceSeed(row.seedPayloadJson);
  if (!seed.referenceStart) throw new AppError("该任务不是参考创作任务。", 400);
  const lock = await tx.novelWorkflowTask.updateMany({
    where: { id: taskId, seedPayloadJson: row.seedPayloadJson, updatedAt: row.updatedAt },
    data: { heartbeatAt: new Date() },
  });
  if (lock.count !== 1) throw new AppError("任务有更新，请刷新后重试。", 409);
  return { row, seed, reference: seed.referenceStart };
}

export async function changeReferenceAttempt(
  taskId: string,
  attemptId: string,
  change: (seed: ReferenceTaskSeed) => void,
  data: Prisma.NovelWorkflowTaskUpdateManyMutationInput,
) {
  return prisma.$transaction(async (tx) => {
    const { row, seed, reference } = await lockReferenceTask(tx, taskId);
    if (reference.attemptId !== attemptId || row.novelId || row.status === "cancelled" || row.cancelRequestedAt) {
      throw new AppError("这次生成已失效，请继续最新的创作任务。", 409);
    }
    change(seed);
    await tx.novelWorkflowTask.update({
      where: { id: taskId }, data: { ...data, seedPayloadJson: JSON.stringify(seed) },
    });
  });
}
