import type { VolumePlan, VolumePlanDiff, VolumePlanDiffVolume } from "@novelfoundry/shared/types/novel";

import { compareText, compareStringArray, getChapterChangedFields } from "../domain/chapterComparison";

import { buildVolumeOutlineSnapshot } from "../domain/sourceSignals";

export function estimateChangedLines(beforeText: string, afterText: string): number {
  const beforeLines = beforeText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const afterLines = afterText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);
  let changed = 0;
  for (const line of afterLines) {
    if (!beforeSet.has(line)) changed += 1;
  }
  for (const line of beforeLines) {
    if (!afterSet.has(line)) changed += 1;
  }
  return changed;
}

export function collectVolumeChangedFields(beforeVolume: VolumePlan | undefined, afterVolume: VolumePlan): string[] {
  if (!beforeVolume) {
    return ["新增卷"];
  }
  const changed: string[] = [];
  if (!compareText(beforeVolume.title, afterVolume.title)) changed.push("卷标题");
  if (!compareText(beforeVolume.summary, afterVolume.summary)) changed.push("卷摘要");
  if (!compareText(beforeVolume.openingHook, afterVolume.openingHook)) changed.push("开卷抓手");
  if (!compareText(beforeVolume.mainPromise, afterVolume.mainPromise)) changed.push("主承诺");
  if (!compareText(beforeVolume.primaryPressureSource, afterVolume.primaryPressureSource)) changed.push("主压迫源");
  if (!compareText(beforeVolume.coreSellingPoint, afterVolume.coreSellingPoint)) changed.push("核心卖点");
  if (!compareText(beforeVolume.escalationMode, afterVolume.escalationMode)) changed.push("升级方式");
  if (!compareText(beforeVolume.protagonistChange, afterVolume.protagonistChange)) changed.push("主角变化");
  if (!compareText(beforeVolume.midVolumeRisk, afterVolume.midVolumeRisk)) changed.push("中段风险");
  if (!compareText(beforeVolume.climax, afterVolume.climax)) changed.push("卷末高潮");
  if (!compareText(beforeVolume.payoffType, afterVolume.payoffType)) changed.push("兑现类型");
  if (!compareText(beforeVolume.nextVolumeHook, afterVolume.nextVolumeHook)) changed.push("下卷钩子");
  if (!compareText(beforeVolume.resetPoint, afterVolume.resetPoint)) changed.push("重置点");
  if (!compareStringArray(beforeVolume.openPayoffs, afterVolume.openPayoffs)) changed.push("未兑现事项");
  if (beforeVolume.chapters.length !== afterVolume.chapters.length) changed.push("章节数量");
  const beforeChapterMap = new Map(beforeVolume.chapters.map((chapter) => [chapter.chapterOrder, chapter]));
  const chapterChanged = afterVolume.chapters.some((chapter) => {
    const beforeChapter = beforeChapterMap.get(chapter.chapterOrder);
    if (!beforeChapter) {
      return true;
    }
    return getChapterChangedFields({
      id: beforeChapter.id,
      order: beforeChapter.chapterOrder,
      title: beforeChapter.title,
      expectation: beforeChapter.summary,
      exclusiveEvent: beforeChapter.exclusiveEvent,
      endingState: beforeChapter.endingState,
      nextChapterEntryState: beforeChapter.nextChapterEntryState,
      targetWordCount: beforeChapter.targetWordCount,
      conflictLevel: beforeChapter.conflictLevel,
      revealLevel: beforeChapter.revealLevel,
      mustAvoid: beforeChapter.mustAvoid,
      taskSheet: beforeChapter.taskSheet,
      sceneCards: beforeChapter.sceneCards,
    }, chapter, "update").length > 0;
  });
  if (chapterChanged) changed.push("章节规划");
  return changed;
}

export function buildVolumeDiffSummary(changedVolumes: VolumePlanDiffVolume[]): string {
  if (changedVolumes.length === 0) {
    return "卷级结构无变化。";
  }
  return changedVolumes
    .map((volume) => `第${volume.sortOrder}卷《${volume.title}》：${volume.changedFields.join("、")}${volume.chapterOrders.length > 0 ? `；波及章节 ${volume.chapterOrders.join("、")}` : ""}`)
    .join("\n");
}

export function buildVolumeDiff(
  beforeVolumes: VolumePlan[],
  afterVolumes: VolumePlan[],
  versionMeta: {
    id: string;
    novelId: string;
    version: number;
    status: "draft" | "active" | "frozen";
    diffSummary?: string | null;
  },
): VolumePlanDiff {
  const beforeByOrder = new Map(beforeVolumes.map((volume) => [volume.sortOrder, volume]));
  const changedVolumes: VolumePlanDiffVolume[] = afterVolumes
    .map((volume) => {
      const changedFields = collectVolumeChangedFields(beforeByOrder.get(volume.sortOrder), volume);
      if (changedFields.length === 0) {
        return null;
      }
      const beforeChapterMap = new Map((beforeByOrder.get(volume.sortOrder)?.chapters ?? []).map((chapter) => [chapter.chapterOrder, chapter]));
      const changedChapterOrders = volume.chapters
        .filter((chapter) => {
          const beforeChapter = beforeChapterMap.get(chapter.chapterOrder);
          if (!beforeChapter) {
            return true;
          }
          return getChapterChangedFields({
            id: beforeChapter.id,
            order: beforeChapter.chapterOrder,
            title: beforeChapter.title,
            expectation: beforeChapter.summary,
            exclusiveEvent: beforeChapter.exclusiveEvent,
            endingState: beforeChapter.endingState,
            nextChapterEntryState: beforeChapter.nextChapterEntryState,
            targetWordCount: beforeChapter.targetWordCount,
            conflictLevel: beforeChapter.conflictLevel,
            revealLevel: beforeChapter.revealLevel,
            mustAvoid: beforeChapter.mustAvoid,
            taskSheet: beforeChapter.taskSheet,
            sceneCards: beforeChapter.sceneCards,
          }, chapter, "update").length > 0;
        })
        .map((chapter) => chapter.chapterOrder);
      return {
        sortOrder: volume.sortOrder,
        title: volume.title,
        changedFields,
        chapterOrders: changedChapterOrders,
      };
    })
    .filter((item): item is VolumePlanDiffVolume => Boolean(item));

  const affectedChapterOrders = Array.from(new Set(changedVolumes.flatMap((item) => item.chapterOrders))).sort((a, b) => a - b);
  return {
    id: versionMeta.id,
    novelId: versionMeta.novelId,
    version: versionMeta.version,
    status: versionMeta.status,
    diffSummary: versionMeta.diffSummary ?? buildVolumeDiffSummary(changedVolumes),
    changedLines: estimateChangedLines(buildVolumeOutlineSnapshot(beforeVolumes), buildVolumeOutlineSnapshot(afterVolumes)),
    changedVolumeCount: changedVolumes.length,
    changedChapterCount: affectedChapterOrders.length,
    changedVolumes,
    affectedChapterOrders,
  };
}
