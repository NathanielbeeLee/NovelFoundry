import type { Prisma } from "@prisma/client";
import type { VolumePlan, VolumeChapterPlan } from "@novelfoundry/shared/types/novel";

export function toVolumePlanData(
  novelId: string,
  volume: VolumePlan,
  sourceVersionId: string | null,
): Prisma.VolumePlanUncheckedCreateInput {
  return {
    id: volume.id,
    novelId,
    sortOrder: volume.sortOrder,
    title: volume.title,
    summary: volume.summary ?? null,
    mainPromise: volume.mainPromise ?? null,
    escalationMode: volume.escalationMode ?? null,
    protagonistChange: volume.protagonistChange ?? null,
    climax: volume.climax ?? null,
    nextVolumeHook: volume.nextVolumeHook ?? null,
    resetPoint: volume.resetPoint ?? null,
    openPayoffsJson: JSON.stringify(volume.openPayoffs),
    status: volume.status,
    sourceVersionId,
  };
}


export function toVolumeChapterPlanData(volumeId: string, chapter: VolumeChapterPlan): Prisma.VolumeChapterPlanUncheckedCreateInput {
  const hasConflictLevel = Object.prototype.hasOwnProperty.call(chapter, "conflictLevel");
  const conflictLevelSource = hasConflictLevel
    ? chapter.conflictLevelSource ?? "ai"
    : chapter.conflictLevelSource ?? null;
  return {
    id: chapter.id,
    volumeId,
    chapterId: chapter.chapterId ?? null,
    chapterOrder: chapter.chapterOrder,
    title: chapter.title,
    summary: chapter.summary,
    purpose: chapter.purpose ?? null,
    conflictLevel: chapter.conflictLevel ?? null,
    conflictLevelSource,
    revealLevel: chapter.revealLevel ?? null,
    targetWordCount: chapter.targetWordCount ?? null,
    mustAvoid: chapter.mustAvoid ?? null,
    taskSheet: chapter.taskSheet ?? null,
    sceneCards: chapter.sceneCards ?? null,
    payoffRefsJson: JSON.stringify(chapter.payoffRefs),
  };
}

