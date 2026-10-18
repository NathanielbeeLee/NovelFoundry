import { buildDirectorCompletionProfile, type DirectorCompletionProfile } from "@novelfoundry/shared/types/directorCompletion";
import { prisma } from "../../../../db/prisma";
import type { PipelineRunOptions } from "../../novelCoreShared";
import { ChapterRouteWindowService } from "../../planning/ChapterRouteWindowService";

/** Materialize the next route before job admission and chapter selection. */
export async function ensurePipelineRoute(
  novelId: string,
  options: PipelineRunOptions,
): Promise<DirectorCompletionProfile> {
  if (options.startOrder > options.endOrder) throw new Error("章节执行范围的起点不能超过终点。");
  const novel = await prisma.novel.findUnique({
    where: { id: novelId },
    select: { estimatedChapterCount: true },
  });
  const candidates = [novel?.estimatedChapterCount, options.targetEndChapter];
  const bookTarget = candidates.find((value): value is number => (
    typeof value === "number" && Number.isFinite(value) && value > 0
  ));
  // Saved book size wins over legacy job payloads that used the batch end.
  // A stale estimate must never contract an explicitly admitted execution range.
  const target = Math.max(options.endOrder, bookTarget ?? options.endOrder);
  const completionProfile = buildDirectorCompletionProfile(target);
  if (options.controlPolicy?.advanceMode !== "full_book_autopilot") return completionProfile;
  await new ChapterRouteWindowService().ensureRouteWindow(novelId, options.startOrder, {
    min: 1,
    target: Math.min(5, target - options.startOrder + 1),
    completionProfile,
    provider: options.provider,
    model: options.model,
    temperature: options.temperature,
    taskId: options.workflowTaskId,
  });
  return completionProfile;
}
