import type { LLMProvider } from "@novelfoundry/shared/types/llm";
import type { DirectorCompletionProfile } from "@novelfoundry/shared/types/directorCompletion";
import type { VolumePlanDocument } from "@novelfoundry/shared/types/novel";
import { prisma } from "../../../db/prisma";
import { NovelVolumeService, countContinuousRouteWindow, type RouteWindowSnapshot } from "../volume/NovelVolumeService";
import {
  getBeatExpectedChapterCount,
  resolveVolumeChapterBeatKey,
} from "../volume/volumeGenerationHelpers";

export interface ChapterRouteWindowOptions {
  min?: number;
  target?: number;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
  completionProfile?: DirectorCompletionProfile;
  /** Keeps JIT planning owned by the same auto-director task as chapter execution. */
  taskId?: string;
}

export interface ChapterRouteWindowResult {
  availableRouteCount: number;
  extended: boolean;
}

const routeWindowLocks = new Map<string, Promise<ChapterRouteWindowResult>>();

export class ChapterRouteWindowService {
  constructor(private readonly volumeService = new NovelVolumeService()) {}

  async ensureRouteWindow(
    novelId: string,
    fromChapterOrder: number,
    options: ChapterRouteWindowOptions = {},
  ): Promise<ChapterRouteWindowResult> {
    const active = routeWindowLocks.get(novelId);
    // Serialize different windows of the same book; do not return another
    // window's result or let simultaneous append operations overwrite a plan.
    const task = (active ? active.catch(() => undefined) : Promise.resolve())
      .then(() => this.ensureRouteWindowUnlocked(novelId, fromChapterOrder, options))
      .finally(() => {
        if (routeWindowLocks.get(novelId) === task) routeWindowLocks.delete(novelId);
      });
    routeWindowLocks.set(novelId, task);
    return task;
  }

  private async ensureRouteWindowUnlocked(
    novelId: string,
    fromChapterOrder: number,
    options: ChapterRouteWindowOptions,
  ): Promise<ChapterRouteWindowResult> {
    const bookEnd = options.completionProfile?.targetChapterCount;
    const remainingInBook = bookEnd == null ? Infinity : Math.max(0, bookEnd - fromChapterOrder + 1);
    if (remainingInBook === 0) return { availableRouteCount: 0, extended: false };
    const minimum = Math.min(remainingInBook, Math.max(1, options.min ?? 3));
    const target = Math.min(remainingInBook, Math.max(minimum, options.target ?? 5));
    const compactTarget = options.completionProfile?.mode === "compact_book"
      ? options.completionProfile.targetChapterCount
      : null;
    const remaining = compactTarget == null ? null : Math.max(0, compactTarget - fromChapterOrder + 1);
    const closingGuidance = remaining != null && remaining <= 3
      ? `紧凑全书终章倒计时：剩余约 ${remaining} 章。只生成结局合同所需的收束路线，不要创建新的主线或下一阶段钩子。`
      : remaining != null && remaining <= 8
        ? `紧凑全书收束规划：剩余约 ${remaining} 章。优先完成主冲突、关系变化和未兑现回报，不扩展远期世界或新主线。`
        : undefined;
    let snapshot = await this.volumeService.readRouteWindowWorkspace(novelId);
    let workspace = snapshot.document;
    let availableRouteCount = await this.countAvailableRoute(novelId, workspace, fromChapterOrder, bookEnd);
    if (availableRouteCount >= minimum) {
      return { availableRouteCount, extended: false };
    }

    // Saved plans are sufficient to rebuild missing execution rows without another AI call.
    snapshot = await this.volumeService.appendRouteWindow(novelId, workspace, snapshot, { endOrder: bookEnd });
    workspace = snapshot.document;
    availableRouteCount = await this.countAvailableRoute(novelId, workspace, fromChapterOrder, bookEnd);
    if (availableRouteCount >= minimum) return { availableRouteCount, extended: false };
    let extended = false;
    const visited = new Set<string>();
    while (availableRouteCount < target) {
      const next = this.findNextRouteTarget(workspace);
      const progressKey = JSON.stringify({
        next, availableRouteCount,
        volumes: workspace.volumes.map((volume) => [volume.id, volume.chapters.length]),
        beats: workspace.beatSheets.map((sheet) => [sheet.volumeId, sheet.beats.length]),
      });
      if (visited.has(progressKey)) {
        throw new Error("滚动规划未增加可用章节，已保留已有计划，请重试当前规划步骤。");
      }
      visited.add(progressKey);
      if (!next) {
        const expandedWorkspace = await this.extendFutureVolumeSkeleton(
          novelId,
          snapshot,
          options,
        );
        if (!expandedWorkspace) {
          break;
        }
        snapshot = expandedWorkspace;
        workspace = snapshot.document;
        extended = true;
        continue;
      }
      if (!next.beatKey) {
        const generated = await this.volumeService.generateVolumes(novelId, {
          scope: "beat_sheet",
          targetVolumeId: next.volumeId,
          draftWorkspace: workspace,
          provider: options.provider,
          model: options.model,
          temperature: options.temperature,
          taskId: options.taskId,
          guidance: closingGuidance,
          entrypoint: "jit_route_window",
          persistIntermediateDocuments: false,
        });
        snapshot = await this.volumeService.appendRouteWindow(novelId, generated, snapshot, { endOrder: bookEnd });
        workspace = snapshot.document;
        if (!workspace.beatSheets.some(sheet => sheet.volumeId === next.volumeId && sheet.beats.length)) {
          throw new Error("未补出可用节奏板，已保留已有计划，请重试当前规划步骤。");
        }
        continue;
      }

      const generated = await this.volumeService.generateVolumes(novelId, {
        scope: "chapter_list",
        targetVolumeId: next.volumeId,
        generationMode: "single_beat",
        targetBeatKey: next.beatKey,
        draftWorkspace: workspace,
        provider: options.provider,
        model: options.model,
        temperature: options.temperature,
        taskId: options.taskId,
        guidance: closingGuidance,
        entrypoint: "jit_route_window",
        persistIntermediateDocuments: false,
      });
      snapshot = await this.volumeService.appendRouteWindow(novelId, generated, snapshot, { endOrder: bookEnd });
      workspace = snapshot.document;
      extended = true;
      const previousCount = availableRouteCount;
      availableRouteCount = await this.countAvailableRoute(novelId, workspace, fromChapterOrder, bookEnd);
      if (availableRouteCount <= previousCount) {
        throw new Error("未补出所需的连续章节路线，已保留已有计划，请重试当前规划步骤。");
      }
    }
    if (availableRouteCount < minimum) {
      throw new Error("已保存规划缺少所需的连续章节路线，请核对缺失章序后重试当前规划步骤。");
    }
    return { availableRouteCount, extended };
  }

  private async extendFutureVolumeSkeleton(
    novelId: string,
    snapshot: RouteWindowSnapshot,
    options: ChapterRouteWindowOptions,
  ): Promise<RouteWindowSnapshot | null> {
    const workspace = snapshot.document;
    const targetChapterCount = options.completionProfile?.targetChapterCount ?? 0;
    const plannedChapterEnd = Math.max(
      0,
      ...workspace.volumes.flatMap((volume) => volume.chapters.map((chapter) => chapter.chapterOrder)),
    );
    if (!workspace.strategyPlan || targetChapterCount <= plannedChapterEnd) {
      return null;
    }

    const skeletonVolumeCount = Math.max(
      workspace.volumes.length + 1,
      workspace.strategyPlan.recommendedVolumeCount,
    );
    const generatedSkeleton = await this.volumeService.generateVolumes(novelId, {
      scope: "skeleton",
      skeletonVolumeCount,
      draftWorkspace: workspace,
      provider: options.provider,
      model: options.model,
      temperature: options.temperature,
      taskId: options.taskId,
      entrypoint: "jit_route_window",
      persistIntermediateDocuments: false,
      guidance: [
        "滚动生产需要补齐后续卷骨架。",
        "已有卷及其章节已经进入生产，必须视为固定事实；只为尚未创建的后续卷安排承接、升级和兑现。",
        `全书目标约 ${targetChapterCount} 章；当前只补卷级骨架，不拆远期章节。`,
      ].join("\n"),
    });
    const futureVolumes = generatedSkeleton.volumes.filter(volume => !workspace.volumes.some(saved => saved.id === volume.id));
    if (futureVolumes.length === 0) return null;
    return this.volumeService.appendRouteWindow(novelId, {
      ...workspace, volumes: [...workspace.volumes, ...futureVolumes],
    }, snapshot, { endOrder: options.completionProfile?.targetChapterCount });
  }

  private async countAvailableRoute(novelId: string, workspace: VolumePlanDocument, fromChapterOrder: number, endOrder?: number): Promise<number> {
    const chapters = await prisma.chapter.findMany({
      where: {
        novelId,
        order: { gte: fromChapterOrder, ...(endOrder == null ? {} : { lte: endOrder }) },
      },
      orderBy: { order: "asc" }, select: { id: true, order: true },
    });
    return countContinuousRouteWindow(workspace, chapters, fromChapterOrder, endOrder);
  }

  private findNextRouteTarget(workspace: VolumePlanDocument): { volumeId: string; beatKey: string | null } | null {
    const volumes = workspace.volumes.slice().sort((left, right) => left.sortOrder - right.sortOrder);
    for (const volume of volumes) {
      const beatSheet = workspace.beatSheets.find((sheet) => sheet.volumeId === volume.id);
      if (!beatSheet || beatSheet.beats.length === 0) {
        return { volumeId: volume.id, beatKey: null };
      }
      for (const beat of beatSheet.beats) {
        const generatedCount = volume.chapters.filter((chapter) => (
          resolveVolumeChapterBeatKey({ chapter, volume, beatSheet }) === beat.key
        )).length;
        if (generatedCount < Math.max(1, getBeatExpectedChapterCount(beat))) {
          return { volumeId: volume.id, beatKey: beat.key };
        }
      }
    }
    return null;
  }
}
