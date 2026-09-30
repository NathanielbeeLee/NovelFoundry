import { buildDirectorCompletionProfile } from "@novelfoundry/shared/types/directorCompletion";
import type { PipelineRunOptions } from "../../novelCoreShared";
import { ChapterRouteWindowService } from "../../planning/ChapterRouteWindowService";

/** Materialize the next route before job admission and chapter selection. */
export async function ensurePipelineRoute(novelId: string, options: PipelineRunOptions): Promise<void> {
  if (options.controlPolicy?.advanceMode !== "full_book_autopilot") return;
  const target = options.targetEndChapter ?? options.endOrder;
  if (options.startOrder > target) throw new Error("章节执行范围超出本次全书目标。");
  await new ChapterRouteWindowService().ensureRouteWindow(novelId, options.startOrder, {
    min: 1,
    target: Math.min(5, target - options.startOrder + 1),
    completionProfile: buildDirectorCompletionProfile(target),
    provider: options.provider,
    model: options.model,
    temperature: options.temperature,
    taskId: options.workflowTaskId,
  });
}
