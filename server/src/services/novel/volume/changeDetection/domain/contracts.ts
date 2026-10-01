import type { Chapter, VolumeChapterPlan, VolumeSyncPreview } from "@novelfoundry/shared/types/novel";

export interface ExistingChapterRecord {
  id: string;
  order: number;
  title: string;
  content?: string | null;
  generationState?: Chapter["generationState"] | null;
  chapterStatus?: Chapter["chapterStatus"] | null;
  expectation?: string | null;
  exclusiveEvent?: string | null;
  endingState?: string | null;
  nextChapterEntryState?: string | null;
  targetWordCount?: number | null;
  conflictLevel?: number | null;
  revealLevel?: number | null;
  mustAvoid?: string | null;
  taskSheet?: string | null;
  sceneCards?: string | null;
}

export interface VolumeSyncPlan {
  preview: VolumeSyncPreview;
  links: Array<{
    volumeChapterId: string;
    chapterId: string;
  }>;
  creates: Array<{
    volumeTitle: string;
    chapter: VolumeChapterPlan;
  }>;
  updates: Array<{
    chapterId: string;
    chapter: VolumeChapterPlan;
    clearContent: boolean;
    preserveWorkflowState: boolean;
    existingGenerationState?: Chapter["generationState"] | null;
    existingChapterStatus?: Chapter["chapterStatus"] | null;
  }>;
  deletes: Array<{
    chapterId: string;
    order: number;
    title: string;
    hasContent: boolean;
  }>;
}
