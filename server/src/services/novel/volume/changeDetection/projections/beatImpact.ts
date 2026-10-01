import type { VolumeBeatImpactItem, VolumeBeatSheet, VolumeImpactResult, VolumePlan, VolumePlanDiff } from "@novelfoundry/shared/types/novel";

import { type ExistingChapterRecord } from "../domain/contracts";

import { resolveChapterBeatKey, hasGeneratedContent } from "../domain/chapterComparison";

import { buildVolumeDiff } from "./planDiff";

export function buildVolumeBeatImpactItems(input: {
  afterVolumes: VolumePlan[];
  beatSheets?: VolumeBeatSheet[];
  existingChapters?: ExistingChapterRecord[];
  diff: VolumePlanDiff;
}): VolumeBeatImpactItem[] {
  const beatSheetsByVolumeId = new Map(
    (input.beatSheets ?? []).map((sheet) => [sheet.volumeId, sheet] as const),
  );
  const existingByOrder = new Map(
    (input.existingChapters ?? []).map((chapter) => [chapter.order, chapter] as const),
  );
  const changedVolumeOrders = new Set(input.diff.changedVolumes.map((volume) => volume.sortOrder));
  const changedChapterOrders = new Set(input.diff.affectedChapterOrders);
  const firstChangedChapterOrder = input.diff.affectedChapterOrders[0] ?? null;
  const items: VolumeBeatImpactItem[] = [];

  for (const volume of input.afterVolumes.slice().sort((left, right) => left.sortOrder - right.sortOrder)) {
    if (!changedVolumeOrders.has(volume.sortOrder) && changedChapterOrders.size === 0) {
      continue;
    }
    const beatSheet = beatSheetsByVolumeId.get(volume.id);
    if (!beatSheet) {
      continue;
    }
    const volumeHasPlanLevelChange = input.diff.changedVolumes.some((changedVolume) => (
      changedVolume.sortOrder === volume.sortOrder
      && changedVolume.changedFields.some((field) => field !== "章节规划" && field !== "章节数量")
    ));

    for (const beat of beatSheet.beats) {
      const beatChapters = volume.chapters
        .filter((chapter) => resolveChapterBeatKey({ chapter, volume, beatSheet }) === beat.key)
        .sort((left, right) => left.chapterOrder - right.chapterOrder);
      const chapterOrders = beatChapters.map((chapter) => chapter.chapterOrder);
      const overlapsChangedChapter = chapterOrders.some((order) => changedChapterOrders.has(order));
      const followsChangedChapter = firstChangedChapterOrder != null
        && chapterOrders.some((order) => order >= firstChangedChapterOrder);
      const shouldIncludeBeat = volumeHasPlanLevelChange || overlapsChangedChapter || followsChangedChapter || (
        chapterOrders.length === 0
        && changedVolumeOrders.has(volume.sortOrder)
      );
      if (!shouldIncludeBeat) {
        continue;
      }
      const hasDraftContent = chapterOrders.some((order) => hasGeneratedContent(existingByOrder.get(order)?.content));
      const status = hasDraftContent
        ? "locked_with_draft"
        : (chapterOrders.length > 0 ? "stale" : "pending");
      items.push({
        volumeId: volume.id,
        volumeOrder: volume.sortOrder,
        volumeTitle: volume.title,
        beatKey: beat.key,
        beatLabel: beat.label,
        beatTitle: beat.title ?? null,
        chapterOrders,
        status,
        reason: hasDraftContent
          ? "locked_with_draft"
          : (chapterOrders.length > 0 ? "generated_without_draft" : "ungenerated"),
        hasDraftContent,
      });
    }
  }

  return items;
}

export function buildForwardVolumeBeatImpactItems(input: {
  volumes: VolumePlan[];
  beatSheets?: VolumeBeatSheet[];
  existingChapters?: ExistingChapterRecord[];
  fromChapterOrder?: number | null;
}): VolumeBeatImpactItem[] {
  const beatSheetsByVolumeId = new Map(
    (input.beatSheets ?? []).map((sheet) => [sheet.volumeId, sheet] as const),
  );
  const existingByOrder = new Map(
    (input.existingChapters ?? []).map((chapter) => [chapter.order, chapter] as const),
  );
  const firstAffectedOrder = Math.max(1, Math.round(input.fromChapterOrder ?? 1));
  const items: VolumeBeatImpactItem[] = [];

  for (const volume of input.volumes.slice().sort((left, right) => left.sortOrder - right.sortOrder)) {
    const beatSheet = beatSheetsByVolumeId.get(volume.id);
    if (!beatSheet) {
      continue;
    }
    for (const beat of beatSheet.beats) {
      const beatChapters = volume.chapters
        .filter((chapter) => resolveChapterBeatKey({ chapter, volume, beatSheet }) === beat.key)
        .sort((left, right) => left.chapterOrder - right.chapterOrder);
      const chapterOrders = beatChapters.map((chapter) => chapter.chapterOrder);
      const isForwardBeat = chapterOrders.length === 0
        || chapterOrders.some((order) => order >= firstAffectedOrder);
      if (!isForwardBeat) {
        continue;
      }
      const hasDraftContent = chapterOrders.some((order) => hasGeneratedContent(existingByOrder.get(order)?.content));
      items.push({
        volumeId: volume.id,
        volumeOrder: volume.sortOrder,
        volumeTitle: volume.title,
        beatKey: beat.key,
        beatLabel: beat.label,
        beatTitle: beat.title ?? null,
        chapterOrders,
        status: hasDraftContent
          ? "locked_with_draft"
          : (chapterOrders.length > 0 ? "stale" : "pending"),
        reason: hasDraftContent
          ? "locked_with_draft"
          : (chapterOrders.length > 0 ? "generated_without_draft" : "ungenerated"),
        hasDraftContent,
      });
    }
  }

  return items;
}

export function buildVolumeImpactResult(
  novelId: string,
  beforeVolumes: VolumePlan[],
  afterVolumes: VolumePlan[],
  sourceVersion: number | null,
  context: {
    beatSheets?: VolumeBeatSheet[];
    existingChapters?: ExistingChapterRecord[];
  } = {},
): VolumeImpactResult {
  const diff = buildVolumeDiff(beforeVolumes, afterVolumes, {
    id: "impact-preview",
    novelId,
    version: sourceVersion ?? 0,
    status: "draft",
    diffSummary: null,
  });
  const requiresChapterSync = diff.changedChapterCount > 0 || diff.changedVolumeCount > 0;
  const requiresCharacterReview = diff.changedVolumes.some((volume) => (
    volume.changedFields.includes("主承诺")
    || volume.changedFields.includes("主角变化")
    || volume.changedFields.includes("卷末高潮")
  ));
  const affectedBeats = buildVolumeBeatImpactItems({
    afterVolumes,
    beatSheets: context.beatSheets,
    existingChapters: context.existingChapters,
    diff,
  });
  const staleBeatCount = affectedBeats.filter((beat) => beat.status !== "locked_with_draft").length;
  const lockedBeatCount = affectedBeats.filter((beat) => beat.status === "locked_with_draft").length;
  const recommendedActions = [
    requiresChapterSync ? "同步章节计划" : "",
    requiresCharacterReview ? "复核角色职责与成长线" : "",
    staleBeatCount > 0 ? "接入后续未写段" : "",
    diff.changedLines >= 12 ? "复查关键伏笔与兑现链" : "",
  ].filter(Boolean);

  return {
    novelId,
    sourceVersion,
    changedLines: diff.changedLines,
    affectedVolumeCount: diff.changedVolumeCount,
    affectedChapterCount: diff.changedChapterCount,
    affectedVolumes: diff.changedVolumes,
    affectedBeats,
    staleBeatCount,
    lockedBeatCount,
    defaultImpactAction: staleBeatCount > 0 ? "接入后续未写段" : undefined,
    advancedImpactActions: [
      staleBeatCount > 0 ? "重排某个未写节奏段的参与者" : "",
      lockedBeatCount > 0 ? "检查已有正文段的角色一致性" : "",
      requiresCharacterReview ? "重跑节奏板或卷战略" : "",
    ].filter(Boolean),
    requiresChapterSync,
    requiresCharacterReview,
    recommendedActions,
  };
}
