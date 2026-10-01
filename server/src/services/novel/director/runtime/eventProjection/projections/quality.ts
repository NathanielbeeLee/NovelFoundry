import type { DirectorEvent, DirectorRuntimeProjection } from "@novelfoundry/shared/types/directorRuntime";
import type { DirectorQualityLoopBudgetEntry, DirectorQualityLoopBudgetNextAction } from "@novelfoundry/shared/types/novelDirector";
import { resolveDirectorQualityLoopBudgetNextAction } from "../../DirectorQualityLoopBudgetLedgerService";
import { timestampOf } from "./eventStatus";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isQualityBudgetNextAction(value: unknown): value is DirectorQualityLoopBudgetNextAction {
  return value === "auto_patch_repair"
    || value === "auto_rewrite_chapter"
    || value === "auto_replan_window"
    || value === "defer_and_continue";
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readQualityBudgetEntry(value: unknown): DirectorQualityLoopBudgetEntry | null {
  if (!isRecord(value)) {
    return null;
  }
  const signatureKey = readNullableString(value.signatureKey);
  const issueSignature = readNullableString(value.issueSignature);
  if (!signatureKey || !issueSignature) {
    return null;
  }
  return {
    signatureKey,
    issueSignature,
    blockingLedgerKeys: Array.isArray(value.blockingLedgerKeys)
      ? value.blockingLedgerKeys.filter((item): item is string => typeof item === "string")
      : [],
    affectedChapterWindow: isRecord(value.affectedChapterWindow)
      ? {
        startOrder: readFiniteNumber(value.affectedChapterWindow.startOrder),
        endOrder: readFiniteNumber(value.affectedChapterWindow.endOrder),
        chapterOrders: Array.isArray(value.affectedChapterWindow.chapterOrders)
          ? value.affectedChapterWindow.chapterOrders.filter((item): item is number => typeof item === "number" && Number.isFinite(item))
          : [],
        chapterIds: Array.isArray(value.affectedChapterWindow.chapterIds)
          ? value.affectedChapterWindow.chapterIds.filter((item): item is string => typeof item === "string")
          : [],
      }
      : {
        startOrder: null,
        endOrder: null,
        chapterOrders: [],
        chapterIds: [],
      },
    patchRepairCount: readFiniteNumber(value.patchRepairCount) ?? 0,
    chapterRewriteCount: readFiniteNumber(value.chapterRewriteCount) ?? 0,
    windowReplanCount: readFiniteNumber(value.windowReplanCount) ?? 0,
    deferredCount: readFiniteNumber(value.deferredCount) ?? 0,
    lastAction: null,
    lastReason: readNullableString(value.lastReason),
    lastChapterId: readNullableString(value.lastChapterId),
    lastChapterOrder: readFiniteNumber(value.lastChapterOrder),
    updatedAt: readNullableString(value.updatedAt) ?? new Date(0).toISOString(),
  };
}

export function buildQualityDebtSummary(
  events: DirectorEvent[],
): DirectorRuntimeProjection["qualityDebtSummary"] {
  const debtEvents = events
    .filter((event) => event.type === "continue_with_risk")
    .sort((left, right) => timestampOf(right.occurredAt) - timestampOf(left.occurredAt));
  if (debtEvents.length === 0) {
    return null;
  }
  const deferredChapterOrders = Array.from(new Set(debtEvents
    .map((event) => {
      const order = event.metadata?.chapterOrder;
      if (typeof order === "number" && Number.isFinite(order)) {
        return order;
      }
      const match = /chapter_order:(\d+)/.exec(event.affectedScope ?? "");
      return match ? Number(match[1]) : null;
    })
    .filter((order): order is number => typeof order === "number" && Number.isFinite(order))))
    .sort((left, right) => left - right);
  return {
    deferredChapterCount: debtEvents.length,
    deferredChapterOrders,
    latestReason: debtEvents[0]?.summary ?? null,
  };
}

function formatQualityBudgetNextAction(action: DirectorQualityLoopBudgetNextAction): string {
  const labels: Record<DirectorQualityLoopBudgetNextAction, string> = {
    auto_patch_repair: "先尝试局部修复",
    auto_rewrite_chapter: "改用整章重写",
    auto_replan_window: "重规划受影响章节",
    defer_and_continue: "登记为质量待回收并继续后续章节",
  };
  return labels[action];
}

export function buildQualityBudgetSummary(
  events: DirectorEvent[],
): DirectorRuntimeProjection["qualityBudgetSummary"] {
  const budgetEvents = events
    .map((event) => {
      const entry = readQualityBudgetEntry(event.metadata?.qualityBudgetEntry);
      if (!entry) {
        return null;
      }
      return {
        event,
        entry,
        nextAction: isQualityBudgetNextAction(event.metadata?.qualityBudgetNextAction)
          ? event.metadata.qualityBudgetNextAction
          : resolveDirectorQualityLoopBudgetNextAction(entry),
      };
    })
    .filter((item): item is {
      event: DirectorEvent;
      entry: DirectorQualityLoopBudgetEntry;
      nextAction: DirectorQualityLoopBudgetNextAction;
    } => Boolean(item))
    .sort((left, right) => timestampOf(right.event.occurredAt) - timestampOf(left.event.occurredAt));
  const latest = budgetEvents[0];
  if (!latest) {
    return null;
  }
  const { entry, nextAction } = latest;
  const nextActionLabel = formatQualityBudgetNextAction(nextAction);
  const currentChapterOrder = entry.lastChapterOrder
    ?? readFiniteNumber(latest.event.metadata?.chapterOrder)
    ?? (entry.affectedChapterWindow.chapterOrders ?? [])[0]
    ?? null;
  return {
    currentChapterId: entry.lastChapterId ?? null,
    currentChapterOrder,
    latestSignatureKey: entry.signatureKey,
    latestIssueSignature: entry.issueSignature,
    latestReason: entry.lastReason ?? latest.event.summary ?? null,
    patchRepairUsed: entry.patchRepairCount,
    chapterRewriteUsed: entry.chapterRewriteCount,
    windowReplanUsed: entry.windowReplanCount,
    deferredCount: entry.deferredCount,
    nextAction,
    nextActionLabel,
    explanation: `质量预算：局部修复 ${entry.patchRepairCount}/1，整章重写 ${entry.chapterRewriteCount}/1，窗口重规划 ${entry.windowReplanCount}/1；同类问题下一步会${nextActionLabel}。`,
  };
}

export function readLatestQualityLoopAssessment(events: DirectorEvent[]): {
  rootCauseCode: DirectorRuntimeProjection["rootCauseCode"];
  blockingObligations: NonNullable<DirectorRuntimeProjection["blockingObligations"]>;
} {
  const latest = events
    .filter((event) => event.type === "quality_loop_assessed")
    .sort((left, right) => timestampOf(right.occurredAt) - timestampOf(left.occurredAt))
    .find((event) => event.metadata?.assessment && typeof event.metadata.assessment === "object");
  const assessment = latest?.metadata?.assessment as {
    rootCauseCode?: DirectorRuntimeProjection["rootCauseCode"];
    blockingObligations?: NonNullable<DirectorRuntimeProjection["blockingObligations"]>;
  } | undefined;
  return {
    rootCauseCode: assessment?.rootCauseCode ?? null,
    blockingObligations: assessment?.blockingObligations ?? [],
  };
}
