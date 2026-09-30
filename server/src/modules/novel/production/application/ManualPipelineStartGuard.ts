import type { PipelineJob } from "@novelfoundry/shared/types/novel";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import type { NovelApplicationServices } from "../../../../services/novel/application/NovelApplicationContracts";
import { findActiveWholeBookReviewRun } from "../../quality/application/wholeBookReviewRunState";

type PipelineService = Pick<NovelApplicationServices, "startPipelineJob" | "getPipelineJob">;

interface PipelineRange {
  startOrder: number;
  endOrder: number;
}

interface StartPipelineResult {
  job: PipelineJob;
  reused: boolean;
}

const startLocks = new Set<string>();

async function withNovelStartLock<T>(novelId: string, runner: () => Promise<T>): Promise<T> {
  while (startLocks.has(novelId)) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  startLocks.add(novelId);
  try {
    return await runner();
  } finally {
    startLocks.delete(novelId);
  }
}

async function findActivePipelineRow(novelId: string) {
  return prisma.generationJob.findFirst({
    where: {
      novelId,
      status: { in: ["queued", "running"] },
      pendingManualRecovery: false,
    },
    orderBy: [
      { completedCount: "desc" },
      { progress: "desc" },
      { updatedAt: "desc" },
      { createdAt: "asc" },
    ],
    select: { id: true, startOrder: true, endOrder: true },
  });
}

export async function getActiveManualPipelineJob(
  service: Pick<PipelineService, "getPipelineJob">,
  novelId: string,
): Promise<PipelineJob | null> {
  const active = await findActivePipelineRow(novelId);
  if (!active) {
    return null;
  }
  return service.getPipelineJob(novelId, active.id) as Promise<PipelineJob | null>;
}

export async function startOrReuseManualPipelineJob(
  service: PipelineService,
  novelId: string,
  options: PipelineRange & Record<string, unknown>,
): Promise<StartPipelineResult> {
  return withNovelStartLock(novelId, async () => {
    const activeReview = await findActiveWholeBookReviewRun(novelId);
    if (activeReview) {
      throw new AppError(
        `第 ${activeReview.startOrder}—${activeReview.endOrder} 章正在进行全书审校，请等待审校完成后再启动批量任务。`,
        409,
        { reviewRunId: activeReview.id },
      );
    }

    const active = await findActivePipelineRow(novelId);
    if (active) {
      const job = await service.getPipelineJob(novelId, active.id) as PipelineJob | null;
      if (!job) {
        throw new AppError("运行中的批量任务暂时无法读取，请稍后重试。", 409);
      }
      if (active.startOrder === options.startOrder && active.endOrder === options.endOrder) {
        return { job, reused: true };
      }
      throw new AppError(
        `当前已有第 ${active.startOrder}—${active.endOrder} 章的批量任务，请等待完成后再启动其他范围。`,
        409,
        { pipelineJobId: active.id },
      );
    }

    const job = await service.startPipelineJob(novelId, options) as PipelineJob;
    return { job, reused: false };
  });
}
