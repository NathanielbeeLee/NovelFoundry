import type { VolumePlan } from "@novelfoundry/shared/types/novel";

import { normalizeStringArray } from "./chapterComparison";

export function buildVolumeOutlineSnapshot(volumes: VolumePlan[]): string {
  if (volumes.length === 0) {
    return "";
  }
  return volumes
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((volume) => {
      const chapterSpan = volume.chapters.length > 0
        ? `${volume.chapters[0]?.chapterOrder ?? "-"}-${volume.chapters[volume.chapters.length - 1]?.chapterOrder ?? "-"}`
        : "未拆章";
      const lines = [
        `【第${volume.sortOrder}卷】${volume.title}`,
        volume.summary ? `卷摘要：${volume.summary}` : "",
        volume.openingHook ? `开卷抓手：${volume.openingHook}` : "",
        volume.mainPromise ? `主承诺：${volume.mainPromise}` : "",
        volume.primaryPressureSource ? `主压迫源：${volume.primaryPressureSource}` : "",
        volume.coreSellingPoint ? `核心卖点：${volume.coreSellingPoint}` : "",
        volume.escalationMode ? `升级方式：${volume.escalationMode}` : "",
        volume.protagonistChange ? `主角变化：${volume.protagonistChange}` : "",
        volume.midVolumeRisk ? `中段风险：${volume.midVolumeRisk}` : "",
        volume.climax ? `卷末高潮：${volume.climax}` : "",
        volume.payoffType ? `兑现类型：${volume.payoffType}` : "",
        volume.nextVolumeHook ? `下卷钩子：${volume.nextVolumeHook}` : "",
        volume.resetPoint ? `重置点：${volume.resetPoint}` : "",
        volume.openPayoffs.length > 0 ? `未兑现事项：${volume.openPayoffs.join("、")}` : "",
        `章节范围：${chapterSpan}`,
      ].filter(Boolean);
      return lines.join("\n");
    })
    .join("\n\n");
}

export function buildPayoffLedgerSignalSnapshot(volumes: VolumePlan[]) {
  return volumes
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((volume) => {
      const openPayoffs = normalizeStringArray(volume.openPayoffs);
      const payoffRefChapters = volume.chapters
        .slice()
        .sort((a, b) => a.chapterOrder - b.chapterOrder)
        .map((chapter) => ({
          chapterOrder: chapter.chapterOrder,
          payoffRefs: normalizeStringArray(chapter.payoffRefs),
        }))
        .filter((chapter) => chapter.payoffRefs.length > 0);
      const shouldTrackVolumeWindow = openPayoffs.length > 0 || payoffRefChapters.length > 0;
      if (!shouldTrackVolumeWindow) {
        return null;
      }
      return {
        sortOrder: volume.sortOrder,
        openPayoffs,
        chapterOrders: volume.chapters
          .slice()
          .sort((a, b) => a.chapterOrder - b.chapterOrder)
          .map((chapter) => chapter.chapterOrder),
        payoffRefChapters,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

export function hasPayoffLedgerSourceSignals(volumes: VolumePlan[]): boolean {
  return buildPayoffLedgerSignalSnapshot(volumes).length > 0;
}

export function hasPayoffLedgerRelevantPlanChanges(beforeVolumes: VolumePlan[], afterVolumes: VolumePlan[]): boolean {
  return JSON.stringify(buildPayoffLedgerSignalSnapshot(beforeVolumes))
    !== JSON.stringify(buildPayoffLedgerSignalSnapshot(afterVolumes));
}
