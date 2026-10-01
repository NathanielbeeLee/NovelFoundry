import type { DirectorTakeoverExecutableRangeSnapshot, DirectorTakeoverPipelineJobSnapshot, DirectorTakeoverCheckpointSnapshot } from "@novelfoundry/shared/types/novelDirector";
import type { DirectorTakeoverNovelContext, DirectorTakeoverAssetSnapshot } from "./contracts";

export function hasMeaningfulSeedMaterial(novel: DirectorTakeoverNovelContext): boolean {
  return Boolean(
    novel.description?.trim()
    || novel.targetAudience?.trim()
    || novel.bookSellingPoint?.trim()
    || novel.competingFeel?.trim()
    || novel.first30ChapterPromise?.trim()
    || novel.commercialTags.length > 0
    || novel.genreId?.trim()
    || novel.worldId?.trim(),
  );
}

export function isStoryMacroReady(snapshot: DirectorTakeoverAssetSnapshot): boolean {
  return snapshot.hasStoryMacroPlan && snapshot.hasBookContract;
}

export function isCharacterReady(snapshot: DirectorTakeoverAssetSnapshot): boolean {
  return snapshot.characterCount > 0;
}

export function isOutlineReady(snapshot: DirectorTakeoverAssetSnapshot): boolean {
  return snapshot.volumeCount > 0 && Boolean(snapshot.hasVolumeStrategyPlan);
}

export function isTakeoverStructuredOutlineReadyForValidation(snapshot: Pick<DirectorTakeoverAssetSnapshot, "structuredOutlineRecoveryStep">): boolean {
  return snapshot.structuredOutlineRecoveryStep === "chapter_sync"
    || snapshot.structuredOutlineRecoveryStep === "completed";
}

export function isStructuredReady(snapshot: DirectorTakeoverAssetSnapshot): boolean {
  return isTakeoverStructuredOutlineReadyForValidation(snapshot);
}

export function isStructuredSyncPending(snapshot: DirectorTakeoverAssetSnapshot): boolean {
  return snapshot.structuredOutlineRecoveryStep === "chapter_sync";
}

export function hasAnyStructuredAsset(snapshot: DirectorTakeoverAssetSnapshot): boolean {
  return Boolean(snapshot.firstVolumeBeatSheetReady)
    || snapshot.firstVolumeChapterCount > 0
    || (snapshot.firstVolumePreparedChapterCount ?? 0) > 0;
}

export function hasExecutableRange(input: {
  snapshot: DirectorTakeoverAssetSnapshot;
  executableRange?: DirectorTakeoverExecutableRangeSnapshot | null;
  latestCheckpoint?: DirectorTakeoverCheckpointSnapshot | null;
  activePipelineJob?: DirectorTakeoverPipelineJobSnapshot | null;
}): boolean {
  return Boolean(
    input.executableRange
    || input.activePipelineJob,
  );
}

function isRepairingPipelineJob(job: DirectorTakeoverPipelineJobSnapshot | null | undefined): boolean {
  if (!job?.currentStage) {
    return false;
  }
  return job.currentStage === "reviewing" || job.currentStage === "repairing";
}

export function hasPendingRepairContext(input: {
  snapshot: DirectorTakeoverAssetSnapshot;
  activePipelineJob?: DirectorTakeoverPipelineJobSnapshot | null;
  latestCheckpoint?: DirectorTakeoverCheckpointSnapshot | null;
}): boolean {
  return Boolean(
    isRepairingPipelineJob(input.activePipelineJob)
    || input.latestCheckpoint?.checkpointType === "chapter_batch_ready"
    || input.latestCheckpoint?.checkpointType === "replan_required"
    || (input.snapshot.pendingRepairChapterCount ?? 0) > 0,
  );
}
