import type { VolumeChapterPlan, VolumeBeatSheet, VolumePlan } from "@novelfoundry/shared/types/novel";

import { type ExistingChapterRecord } from "./contracts";

export function compareText(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? "").trim() === (b ?? "").trim();
}

export function compareNumber(a: number | null | undefined, b: number | null | undefined): boolean {
  return (typeof a === "number" ? a : null) === (typeof b === "number" ? b : null);
}

export function compareStringArray(a: string[], b: string[]): boolean {
  return a.join("\n") === b.join("\n");
}

export function normalizeStringArray(value: string[] | null | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export function flattenVolumeChapters(volumes: VolumePlan[]) {
  return volumes
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .flatMap((volume) => volume.chapters
      .slice()
      .sort((a, b) => a.chapterOrder - b.chapterOrder)
      .map((chapter) => ({ volume, chapter })));
}

export function hasGeneratedContent(content: string | null | undefined): boolean {
  return Boolean(content?.trim());
}

export function normalizeLookupTitle(title: string): string {
  return title.trim().toLowerCase();
}

export function normalizeOptionalId(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
}

export function parseBeatChapterSpan(chapterSpanHint: string): { start: number; end: number } | null {
  const matches = Array.from(chapterSpanHint.matchAll(/\d+/g), (match) => Number(match[0]));
  if (matches.length === 0 || matches.some((value) => Number.isNaN(value))) {
    return null;
  }
  const start = Math.max(1, matches[0]);
  return {
    start,
    end: Math.max(start, matches[matches.length - 1]),
  };
}

export function resolveChapterBeatKey(input: {
  chapter: VolumeChapterPlan;
  volume: VolumePlan;
  beatSheet: VolumeBeatSheet;
}): string | null {
  const explicitBeatKey = input.chapter.beatKey?.trim();
  if (explicitBeatKey) {
    return explicitBeatKey;
  }
  const localOrder = input.volume.chapters
    .slice()
    .sort((left, right) => left.chapterOrder - right.chapterOrder)
    .findIndex((chapter) => chapter.id === input.chapter.id) + 1;
  if (localOrder <= 0) {
    return null;
  }
  const matchedBeat = input.beatSheet.beats.find((beat) => {
    const span = parseBeatChapterSpan(beat.chapterSpanHint);
    return span ? localOrder >= span.start && localOrder <= span.end : false;
  });
  return matchedBeat?.key ?? null;
}

export function getChapterChangedFields(existing: ExistingChapterRecord, chapter: VolumeChapterPlan, action: "update" | "move"): string[] {
  const changed: string[] = action === "move" ? ["章节顺序"] : [];
  if (!compareText(existing.title, chapter.title)) changed.push("标题");
  if (!compareText(existing.expectation, chapter.summary)) changed.push("摘要");
  if (!compareText(existing.exclusiveEvent, chapter.exclusiveEvent)) changed.push("独占事件");
  if (!compareText(existing.endingState, chapter.endingState)) changed.push("章末状态");
  if (!compareText(existing.nextChapterEntryState, chapter.nextChapterEntryState)) changed.push("下章起始状态");
  if (!compareNumber(existing.targetWordCount, chapter.targetWordCount)) changed.push("目标字数");
  if (!compareNumber(existing.conflictLevel, chapter.conflictLevel)) changed.push("冲突等级");
  if (!compareNumber(existing.revealLevel, chapter.revealLevel)) changed.push("揭露等级");
  if (!compareText(existing.mustAvoid, chapter.mustAvoid)) changed.push("禁止事项");
  if (!compareText(existing.taskSheet, chapter.taskSheet)) changed.push("任务单");
  if (!compareText(existing.sceneCards, chapter.sceneCards)) changed.push("场景预算");
  return changed;
}

export function buildTaskSheetFromVolumeChapter(chapter: VolumeChapterPlan): string {
  const lines = [
    `章节目标：${chapter.purpose || chapter.summary || "推进主线"}`,
    chapter.exclusiveEvent ? `独占事件：${chapter.exclusiveEvent}` : "",
    chapter.endingState ? `章末状态：${chapter.endingState}` : "",
    chapter.nextChapterEntryState ? `下章起始状态：${chapter.nextChapterEntryState}` : "",
    typeof chapter.conflictLevel === "number" ? `冲突等级：${chapter.conflictLevel}` : "",
    typeof chapter.revealLevel === "number" ? `揭露等级：${chapter.revealLevel}` : "",
    typeof chapter.targetWordCount === "number" ? `目标字数：${chapter.targetWordCount}` : "",
    chapter.mustAvoid ? `禁止事项：${chapter.mustAvoid}` : "",
    chapter.payoffRefs.length > 0 ? `兑现关联：${chapter.payoffRefs.join("、")}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}
