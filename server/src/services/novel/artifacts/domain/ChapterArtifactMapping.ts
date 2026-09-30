import type { ContentProvenance } from "@novelfoundry/shared/types/canonicalState";
import {
  type ChapterArtifactDeltaOutput
} from "../../../../prompting/prompts/novel/chapterArtifactDelta.prompts";
import type { stateService } from "../../../state/StateService";
import type { characterResourceLedgerService } from "../../characterResource/CharacterResourceLedgerService";
import { compactText } from "../../characterResource/characterResourceShared";

export const ARTIFACT_DELTA_SOURCE_TYPE = "chapter_artifact_delta";
export const ARTIFACT_DELTA_SOURCE_STAGE = "chapter_execution";

export type CharacterLookupItem = {
  id: string;
  name: string;
  role: string;
  castRole: string | null;
  currentGoal: string | null;
  currentState: string | null;
};

export type ChapterReference = {
  id: string;
  order: number;
  title: string;
};

export type ChapterArtifactDeltaResourceUpdate = ChapterArtifactDeltaOutput["characterResourceDeltas"][number];
export type ChapterArtifactPayoffDelta = ChapterArtifactDeltaOutput["payoffDeltas"][number];
export type ChapterArtifactKnowledgeState = ChapterArtifactDeltaOutput["characterKnowledgeStates"][number];
export type ChapterArtifactDialogueInfluenceResolution = ChapterArtifactDeltaOutput["characterDialogueInfluenceResolutions"][number];

export type ActiveCharacterDialogueInfluence = {
  id: string;
  characterId: string;
  characterName: string;
  summary: string;
  behaviorGuidance: string;
  emotionalGuidance: string | null;
  relationTension: string | null;
  targetStartChapterOrder: number;
  targetEndChapterOrder: number;
};

export interface ChapterArtifactDeltaSyncInput {
  signal?: AbortSignal;
  novelId: string;
  chapterId: string;
  content: string;
  sourceType?: string;
  sourceStage?: string | null;
  provider?: string;
  model?: string;
  temperature?: number;
  contentProvenance?: ContentProvenance;
}

export interface ChapterArtifactDeltaSyncResult {
  contentHash: string;
  output: ChapterArtifactDeltaOutput;
  stateSnapshotId: string | null;
  characterResourceProposalCount: number;
  characterDynamicsCount: number;
  characterKnowledgeStateCount: number;
  characterMindSnapshotCount: number;
  characterDialogueInfluenceAppliedCount: number;
  characterDialogueInfluenceExpiredCount: number;
  payoffDeltaCount: number;
  canonicalCommittedCount: number;
  concreteFactCount: number;
  staleMarkedCount: number;
  requiresFullReconcile: boolean;
}

export function normalizeName(value: string | null | undefined): string {
  return compactText(value).replace(/\s+/g, "").toLowerCase();
}

export function compactPromptText(value: string | null | undefined, maxChars: number): string {
  return compactText(value).slice(0, Math.max(0, maxChars));
}

export function cleanOptionalText(value: string | null | undefined): string | undefined {
  const normalized = compactText(value);
  return normalized || undefined;
}

export function cleanNullableText(value: string | null | undefined): string | null {
  return compactText(value) || null;
}

export function clampConfidence(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : null;
}

export function resolveCharacter(
  characters: Array<{ id: string; name: string; }>,
  name: string | null | undefined,
): { id: string; name: string; } | null {
  const normalized = normalizeName(name);
  if (!normalized) {
    return null;
  }
  const exact = characters.find((item) => normalizeName(item.name) === normalized);
  if (exact) {
    return exact;
  }
  const fuzzy = characters.find((item) => {
    const itemName = normalizeName(item.name);
    return itemName && (normalized.includes(itemName) || itemName.includes(normalized));
  });
  return fuzzy ?? null;
}

export function uniqueTextItems(items: string[] | null | undefined, maxItems: number): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of items ?? []) {
    const normalized = compactText(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= maxItems) {
      break;
    }
  }
  return result;
}

export function joinFactContents(items: string[], maxItems = 3): string | null {
  const joined = uniqueTextItems(items, maxItems).join("；");
  return joined || null;
}

export function buildKnowledgeBoundaryLine(state: ChapterArtifactKnowledgeState): string | null {
  const knownFacts = uniqueTextItems(state.knownFacts, 5);
  const hiddenFacts = uniqueTextItems(state.hiddenFacts, 5);
  if (knownFacts.length === 0 && hiddenFacts.length === 0) {
    return null;
  }
  return [
    "【信息边界】",
    knownFacts.length > 0 ? `已知：${knownFacts.join("；")}` : "已知：无新增",
    hiddenFacts.length > 0 ? `未知/不应超前知情：${hiddenFacts.join("；")}` : "未知/不应超前知情：无",
  ].join("");
}

export function mergeKnowledgeBoundaryState(
  currentState: string | null | undefined,
  boundaryLine: string,
): string {
  const base = String(currentState ?? "")
    .replace(/\n?【信息边界】[^\n]*/g, "")
    .trim();
  const cappedBoundary = boundaryLine.slice(0, 1200);
  const baseBudget = Math.max(0, 1200 - cappedBoundary.length - (base ? 1 : 0));
  const cappedBase = base.slice(0, baseBudget).trim();
  return [cappedBase, cappedBoundary].filter(Boolean).join("\n");
}

export function normalizeLedgerKey(title: string, fallback: string): string {
  const base = compactText(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
  return base || fallback;
}

export function stringifyChapterResourceText(items: Awaited<ReturnType<typeof characterResourceLedgerService.listResources>>): string {
  return items.slice(0, 20).map((item) => [
    `- ${compactPromptText(item.name, 120)}`,
    `holder=${item.holderCharacterName ?? "未知"}`,
    `status=${item.status}`,
    `function=${item.narrativeFunction}`,
    compactPromptText(item.summary, 240),
  ].filter(Boolean).join(" | ")).join("\n");
}

export function stringifyPayoffText(items: Array<{
  ledgerKey: string;
  title: string;
  currentStatus: string;
  summary: string;
  targetStartChapterOrder: number | null;
  targetEndChapterOrder: number | null;
  lastTouchedChapterOrder: number | null;
}>): string {
  return items.slice(0, 20).map((item) => [
    `- ${item.ledgerKey} | ${item.title}`,
    `status=${item.currentStatus}`,
    item.targetStartChapterOrder || item.targetEndChapterOrder
      ? `target=${item.targetStartChapterOrder ?? "?"}-${item.targetEndChapterOrder ?? "?"}`
      : "",
    item.lastTouchedChapterOrder ? `lastTouched=${item.lastTouchedChapterOrder}` : "",
    compactPromptText(item.summary, 240),
  ].filter(Boolean).join(" | ")).join("\n");
}

export function stringifyActiveCharacterDialogueInfluenceText(items: ActiveCharacterDialogueInfluence[]): string {
  return items.slice(0, 8).map((item) => [
    `- influenceId=${item.id}`,
    `角色=${item.characterName}`,
    `对话沉淀=${item.summary}`,
    `窗口=${item.targetStartChapterOrder}-${item.targetEndChapterOrder}`,
    `行动倾向=${item.behaviorGuidance}`,
    item.emotionalGuidance ? `情绪倾向=${item.emotionalGuidance}` : "",
    item.relationTension ? `关系张力=${item.relationTension}` : "",
  ].filter(Boolean).join(" | ")).join("\n");
}

export function stringifyPreviousState(snapshot: Awaited<ReturnType<typeof stateService.getLatestSnapshotBeforeChapter>>): string {
  if (!snapshot) {
    return "";
  }
  const characterLines = snapshot.characterStates
    .map((item) => item.summary?.trim())
    .filter((item): item is string => Boolean(item))
    .slice(0, 6);
  const relationLines = snapshot.relationStates
    .map((item) => item.summary?.trim())
    .filter((item): item is string => Boolean(item))
    .slice(0, 5);
  const infoLines = snapshot.informationStates
    .map((item) => `${item.holderType}:${item.fact}`)
    .slice(0, 6);
  const foreshadowLines = snapshot.foreshadowStates
    .map((item) => `${item.title}(${item.status})`)
    .slice(0, 6);
  return [
    snapshot.summary ? `摘要：${snapshot.summary}` : "",
    characterLines.length > 0 ? `角色：\n${characterLines.map((item) => `- ${item}`).join("\n")}` : "",
    relationLines.length > 0 ? `关系：\n${relationLines.map((item) => `- ${item}`).join("\n")}` : "",
    infoLines.length > 0 ? `信息：\n${infoLines.map((item) => `- ${item}`).join("\n")}` : "",
    foreshadowLines.length > 0 ? `伏笔：\n${foreshadowLines.map((item) => `- ${item}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}
