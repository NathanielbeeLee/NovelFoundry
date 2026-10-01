import type { VolumePlan, VolumeSyncPreviewItem } from "@novelfoundry/shared/types/novel";

import { type ExistingChapterRecord, type VolumeSyncPlan } from "../domain/contracts";

import { flattenVolumeChapters, normalizeLookupTitle, normalizeOptionalId, getChapterChangedFields, hasGeneratedContent } from "../domain/chapterComparison";

export function buildVolumeSyncPlan(
  volumes: VolumePlan[],
  existingChapters: ExistingChapterRecord[],
  options: { preserveContent: boolean; applyDeletes: boolean },
): VolumeSyncPlan {
  const flattened = flattenVolumeChapters(volumes);
  const existingById = new Map(existingChapters.map((chapter) => [chapter.id, chapter]));
  const existingByOrder = new Map(existingChapters.map((chapter) => [chapter.order, chapter]));
  const existingByTitle = new Map(existingChapters.map((chapter) => [normalizeLookupTitle(chapter.title), chapter]));
  const matchedChapterIds = new Set<string>();
  const items: VolumeSyncPreviewItem[] = [];
  const links: VolumeSyncPlan["links"] = [];
  const creates: VolumeSyncPlan["creates"] = [];
  const updates: VolumeSyncPlan["updates"] = [];
  const deletes: VolumeSyncPlan["deletes"] = [];
  let createCount = 0;
  let updateCount = 0;
  let keepCount = 0;
  let moveCount = 0;
  let deleteCount = 0;
  let deleteCandidateCount = 0;
  let affectedGeneratedCount = 0;
  let clearContentCount = 0;

  for (const entry of flattened) {
    const { volume, chapter } = entry;
    const linkedChapterId = normalizeOptionalId(chapter.chapterId);
    const matchedById = linkedChapterId ? existingById.get(linkedChapterId) : undefined;
    const existing = matchedById && !matchedChapterIds.has(matchedById.id)
      ? matchedById
      : (() => {
        if (linkedChapterId) {
          return undefined;
        }
        const existingBySameOrder = existingByOrder.get(chapter.chapterOrder);
        const matchedByOrder = existingBySameOrder && !matchedChapterIds.has(existingBySameOrder.id)
          ? existingBySameOrder
          : undefined;
        const matchedByTitle = existingByTitle.get(normalizeLookupTitle(chapter.title));
        return matchedByOrder ?? (
          matchedByTitle && !matchedChapterIds.has(matchedByTitle.id)
            ? matchedByTitle
            : undefined
        );
      })();

    if (!existing) {
      createCount += 1;
      creates.push({ volumeTitle: volume.title, chapter });
      items.push({
        action: "create",
        volumeTitle: volume.title,
        chapterOrder: chapter.chapterOrder,
        nextTitle: chapter.title,
        hasContent: false,
        changedFields: ["新章节"],
      });
      continue;
    }

    matchedChapterIds.add(existing.id);
    links.push({
      volumeChapterId: chapter.id,
      chapterId: existing.id,
    });
    const action = existing.order === chapter.chapterOrder ? "update" : "move";
    const changedFields = getChapterChangedFields(existing, chapter, action);
    const hasContent = hasGeneratedContent(existing.content);

    if (changedFields.length === 0) {
      keepCount += 1;
      items.push({
        action: "keep",
        volumeTitle: volume.title,
        chapterOrder: chapter.chapterOrder,
        nextTitle: chapter.title,
        previousTitle: existing.title,
        hasContent,
        changedFields: [],
      });
      continue;
    }

    if (action === "move") {
      moveCount += 1;
    } else {
      updateCount += 1;
    }
    if (hasContent) {
      affectedGeneratedCount += 1;
      if (!options.preserveContent) {
        clearContentCount += 1;
      }
    }
    updates.push({
      chapterId: existing.id,
      chapter,
      clearContent: hasContent && !options.preserveContent,
      preserveWorkflowState: hasContent && options.preserveContent,
      existingGenerationState: existing.generationState ?? null,
      existingChapterStatus: existing.chapterStatus ?? null,
    });
    items.push({
      action,
      volumeTitle: volume.title,
      chapterOrder: chapter.chapterOrder,
      nextTitle: chapter.title,
      previousTitle: existing.title,
      hasContent,
      changedFields,
    });
  }

  for (const chapter of existingChapters.slice().sort((a, b) => a.order - b.order)) {
    if (matchedChapterIds.has(chapter.id)) {
      continue;
    }
    const hasContent = hasGeneratedContent(chapter.content);
    if (options.applyDeletes) {
      deleteCount += 1;
      deletes.push({
        chapterId: chapter.id,
        order: chapter.order,
        title: chapter.title,
        hasContent,
      });
      items.push({
        action: "delete",
        volumeTitle: "未匹配",
        chapterOrder: chapter.order,
        nextTitle: chapter.title,
        previousTitle: chapter.title,
        hasContent,
        changedFields: ["从卷纲移除"],
      });
    } else {
      deleteCandidateCount += 1;
      items.push({
        action: "delete_candidate",
        volumeTitle: "未匹配",
        chapterOrder: chapter.order,
        nextTitle: chapter.title,
        previousTitle: chapter.title,
        hasContent,
        changedFields: ["待确认删除"],
      });
    }
  }

  const affectedVolumeCount = new Set(
    items.filter((item) => item.action !== "keep").map((item) => item.volumeTitle),
  ).size;

  return {
    preview: {
      createCount,
      updateCount,
      keepCount,
      moveCount,
      deleteCount,
      deleteCandidateCount,
      affectedGeneratedCount,
      clearContentCount,
      affectedVolumeCount,
      items,
    },
    links,
    creates,
    updates,
    deletes,
  };
}
