import { createHash } from "node:crypto";
import type { GenerationContextPackage } from "@novelfoundry/shared/types/chapterRuntime";
import type {
  ExtractedTimelineEvent,
  TimelineCheckResult,
  TimelineContextForChapter,
  TimelineHookDraft,
} from "@novelfoundry/shared/types/timeline";
import type { LLMProvider } from "@novelfoundry/shared/types/llm";
export type ChapterTimelineFinalizationMode = "stable" | "degraded";
export type TimelineFinalizationClaimStatus = "claimed" | "already_done" | "running";

export const TIMELINE_FINALIZATION_RUNNING_STALE_MS = 15 * 60 * 1000;

export interface ChapterTimelineGateResult {
  sourceContentHash?: string;
  result: TimelineCheckResult;
  extractedEvents: ExtractedTimelineEvent[];
  extractedHooks: TimelineHookDraft[];
  timeAnchor?: { storyDayIndex?: number | null; label?: string | null } | null;
  addressedHookIds: string[];
  resolvedHookIds: string[];
  extractorSucceeded: boolean;
  extractorError?: string | null;
  timelineContext: TimelineContextForChapter | null;
}

export interface ChapterTimelineFinalizationResult {
  syncMode: ChapterTimelineFinalizationMode;
  contentHash: string;
  extractorSucceeded: boolean;
  eventCount: number;
  hookCount: number;
  checkpointWritten: boolean;
}

export interface TimelineFinalizationRequestOptions {
  signal?: AbortSignal;
  provider?: LLMProvider;
  model?: string;
  temperature?: number;
}

export interface FinalizeCurrentContentInput {
  novelId: string;
  chapterId: string;
  content: string;
  contextPackage?: GenerationContextPackage | null;
  request?: TimelineFinalizationRequestOptions;
  timelineGate?: ChapterTimelineGateResult | null;
  mode?: ChapterTimelineFinalizationMode;
  reason?: string;
  sourceStage: string;
  qualityDebt?: boolean;
}

export function hashContent(content: string): string {
  return createHash("sha1").update(content).digest("hex");
}

export function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

export function chapterGoalFromContext(contextPackage: GenerationContextPackage | null | undefined): string {
  return uniqueStrings([
    contextPackage?.chapterMission?.objective,
    contextPackage?.chapter.expectation,
    contextPackage?.plan?.objective,
  ]).join("\n") || "推进当前章节任务";
}

export function fallbackTimeLabel(input: {
  chapterIndex: number;
  contextPackage?: GenerationContextPackage | null;
  timelineContext?: TimelineContextForChapter | null;
}): string {
  return input.timelineContext?.currentTime?.label?.trim()
    || input.contextPackage?.timelineContext?.currentTime?.label?.trim()
    || `第 ${input.chapterIndex} 章`;
}

export function openHookIds(context: TimelineContextForChapter | null | undefined): string[] {
  return context?.openHooks?.map((hook) => hook.id) ?? [];
}

export function plannedEventIds(context: TimelineContextForChapter | null | undefined): string[] {
  return context?.plannedEventsThisChapter?.map((event) => event.id) ?? [];
}

export function forbiddenEventIds(context: TimelineContextForChapter | null | undefined): string[] {
  return context?.forbiddenEvents?.map((event) => event.id) ?? [];
}
