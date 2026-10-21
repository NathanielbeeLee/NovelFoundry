import type { VolumePlan, VolumePlanDocument } from "@novelfoundry/shared/types/novel";
import { AppError } from "../../../../../../middleware/errorHandler";
import { buildVolumeWorkspaceDocument } from "../../../volumeWorkspaceDocument";

export interface RouteWindowSnapshot {
  document: VolumePlanDocument;
  /** Exact saved version and relational planning rows, never a model-produced identity. */
  revision: string;
}

export interface RouteWindowAppendOptions {
  endOrder?: number;
}

const fail = (message: string): never => { throw new AppError(message, 409); };

/** Validate saved identities before draft normalization could silently renumber them. */
export function assertRouteIdentities(document: VolumePlanDocument, novelId = document.novelId): void {
  if (document.novelId !== novelId) fail("章节路线不属于当前小说，请刷新规划后重试。");
  const volumeIds = new Set<string>();
  const volumeOrders = new Set<number>();
  const chapterIds = new Set<string>();
  const chapterOrders = new Set<number>();
  const links = new Set<string>();
  for (const volume of document.volumes) {
    if (!volume.id || volume.novelId !== novelId || volumeIds.has(volume.id)
      || !Number.isSafeInteger(volume.sortOrder) || volume.sortOrder < 1 || volumeOrders.has(volume.sortOrder)) {
      fail("分卷身份或卷序号冲突，请核对已保存的规划。");
    }
    volumeIds.add(volume.id); volumeOrders.add(volume.sortOrder);
    for (const chapter of volume.chapters) {
      if (!chapter.id || chapter.volumeId !== volume.id || chapterIds.has(chapter.id)
        || !Number.isSafeInteger(chapter.chapterOrder) || chapter.chapterOrder < 1 || chapterOrders.has(chapter.chapterOrder)) {
        fail("章节身份或章序冲突，请核对已保存的规划。");
      }
      chapterIds.add(chapter.id); chapterOrders.add(chapter.chapterOrder);
      if (chapter.chapterId) {
        if (links.has(chapter.chapterId)) fail("多个章节规划关联了相同正文，请先核对正文关联。");
        links.add(chapter.chapterId);
      }
    }
  }
  const sheets = new Set<string>();
  for (const sheet of document.beatSheets) {
    const volume = document.volumes.find(item => item.id === sheet.volumeId);
    if (!volume || sheet.volumeSortOrder !== volume.sortOrder || sheets.has(sheet.volumeId)) {
      fail("节奏板与分卷关联冲突，请核对已保存的规划。");
    }
    sheets.add(sheet.volumeId);
    const keys = new Set<string>();
    for (const beat of sheet.beats) {
      if (!beat.key?.trim() || keys.has(beat.key)) fail("节奏板包含重复或空白职能，请核对规划后重试。");
      keys.add(beat.key);
    }
  }
}

/** Recompute projections without normalizing away any saved field, position or timestamp. */
export function projectRouteDocument(document: VolumePlanDocument): VolumePlanDocument {
  const derived = buildVolumeWorkspaceDocument(document);
  return { ...document, readiness: derived.readiness,
    derivedOutline: derived.derivedOutline, derivedStructuredOutline: derived.derivedStructuredOutline };
}

/** Saved rows own persisted columns; the version retains fields not represented by those rows. */
export function overlaySavedRouteRows(document: VolumePlanDocument, rows: VolumePlan[]): VolumePlanDocument {
  const volumeOnlyFields = ["openingHook", "primaryPressureSource", "coreSellingPoint", "midVolumeRisk", "payoffType"] as const;
  const chapterOnlyFields = ["beatKey", "exclusiveEvent", "endingState", "nextChapterEntryState", "styleContract"] as const;
  const volumes = document.volumes.map(volume => ({ ...volume, chapters: [...volume.chapters] }));
  for (const row of rows) {
    const index = volumes.findIndex(volume => volume.id === row.id);
    if (index < 0) { volumes.push(row); continue; }
    const saved = volumes[index];
    const merged = { ...saved, ...row };
    for (const field of volumeOnlyFields) merged[field] = saved[field];
    merged.chapters = [...saved.chapters];
    for (const chapter of row.chapters) {
      const chapterIndex = merged.chapters.findIndex(item => item.id === chapter.id);
      if (chapterIndex < 0) { merged.chapters.push(chapter); continue; }
      const prior = merged.chapters[chapterIndex];
      const next = { ...prior, ...chapter };
      for (const field of chapterOnlyFields) next[field] = prior[field];
      merged.chapters[chapterIndex] = next;
    }
    volumes[index] = merged;
  }
  const result = { ...document, volumes: volumes.sort((a, b) => a.sortOrder - b.sortOrder) };
  assertRouteIdentities(result);
  return projectRouteDocument(result);
}

/** A generated candidate may add routes and beats, but cannot rewrite an existing saved identity. */
export function appendRouteCandidates(
  saved: VolumePlanDocument,
  generated: VolumePlanDocument,
  options: RouteWindowAppendOptions = {},
): VolumePlanDocument {
  assertRouteIdentities(saved);
  assertRouteIdentities(generated, saved.novelId);
  const next = structuredClone(saved);
  const volumesById = new Map(next.volumes.map(volume => [volume.id, volume]));
  const chaptersById = new Map(next.volumes.flatMap(volume => volume.chapters.map(chapter => [chapter.id, chapter] as const)));
  const chaptersByOrder = new Map([...chaptersById.values()].map(chapter => [chapter.chapterOrder, chapter]));
  for (const proposed of generated.volumes) {
    let volume = volumesById.get(proposed.id);
    if (volume && volume.sortOrder !== proposed.sortOrder) fail("补齐路线不能移动已有分卷，请从已保存规划重试。");
    if (!volume) {
      if (next.volumes.some(item => item.sortOrder === proposed.sortOrder)) fail("补齐路线遇到卷序号冲突，请从已保存规划重试。");
      volume = { ...structuredClone(proposed), chapters: [] };
      next.volumes.push(volume); volumesById.set(volume.id, volume);
    }
    for (const chapter of proposed.chapters) {
      const existing = chaptersById.get(chapter.id);
      if (existing) {
        if (existing.volumeId !== volume.id || existing.chapterOrder !== chapter.chapterOrder
          || (chapter.chapterId && existing.chapterId && chapter.chapterId !== existing.chapterId)) {
          fail("补齐路线不能移动或改绑已有章节，请从已保存规划重试。");
        }
        continue;
      }
      if (chaptersByOrder.has(chapter.chapterOrder)) fail("补齐路线遇到章序号冲突，请从已保存规划重试。");
      if (options.endOrder != null && chapter.chapterOrder > options.endOrder) continue;
      const addition = structuredClone(chapter);
      volume.chapters.push(addition);
      chaptersById.set(addition.id, addition); chaptersByOrder.set(addition.chapterOrder, addition);
    }
    volume.chapters.sort((a, b) => a.chapterOrder - b.chapterOrder);
  }
  for (const proposed of generated.beatSheets) {
    const existing = next.beatSheets.find(sheet => sheet.volumeId === proposed.volumeId);
    if (!existing) next.beatSheets.push(structuredClone(proposed));
    else for (const beat of proposed.beats) {
      if (!existing.beats.some(item => item.key === beat.key)) existing.beats.push(structuredClone(beat));
    }
  }
  next.volumes.sort((a, b) => a.sortOrder - b.sortOrder);
  assertRouteIdentities(next);
  return projectRouteDocument(next);
}

export function countContinuousRouteWindow(
  document: VolumePlanDocument,
  executionRows: Array<{ id: string; order: number }>,
  fromOrder: number,
  endOrder = Infinity,
): number {
  assertRouteIdentities(document);
  const executions = new Map<number, string>();
  for (const row of executionRows) {
    if (executions.has(row.order)) fail("小说存在重复章序，请先核对已保存正文。");
    executions.set(row.order, row.id);
  }
  const plans = new Map(document.volumes.flatMap(volume => volume.chapters.map(chapter => [chapter.chapterOrder, chapter] as const)));
  let order = fromOrder;
  while (order <= endOrder) {
    const plan = plans.get(order), executionId = executions.get(order);
    if (!plan || !executionId) break;
    if (plan.chapterId && plan.chapterId !== executionId) fail("章节规划与已保存正文关联不一致，请核对后继续。");
    order += 1;
  }
  return order - fromOrder;
}
