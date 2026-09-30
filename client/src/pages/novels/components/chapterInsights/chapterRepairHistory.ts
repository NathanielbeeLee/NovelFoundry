import {
  CHAPTER_REPAIR_HISTORY_PREFIX,
  type ChapterQualityLoopAction,
  type ChapterQualityLoopBudgetAction,
  type ChapterQualityLoopSignal,
  type ChapterQualityLoopSignalStatus,
  type ChapterRepairHistoryEntry,
  type ChapterRepairHistoryOperation,
  type ChapterRepairHistoryResult,
  type ChapterRepairHistorySource,
} from "@novelfoundry/shared/types/chapterQualityLoop";
import type { QualityScore } from "@novelfoundry/shared/types/novel";

export interface ParsedChapterRepairHistoryEntry {
  kind: "quality_assessment" | "rewrite" | "raw";
  evaluatedAt?: string;
  source?: ChapterRepairHistorySource;
  operation?: ChapterRepairHistoryOperation;
  result?: ChapterRepairHistoryResult;
  overallStatus?: ChapterQualityLoopSignalStatus;
  recommendedAction?: ChapterQualityLoopAction;
  terminalAction?: "defer_and_continue" | null;
  signature?: string | null;
  attempt?: number | null;
  maxAttempts?: number | null;
  budgetAction?: ChapterQualityLoopBudgetAction | null;
  issueCount?: number;
  issueCategories: string[];
  riskSignals: ChapterQualityLoopSignal[];
  scoreBefore?: QualityScore | null;
  scoreAfter?: QualityScore | null;
  qualityReportId?: string | null;
  contentVersion?: string | null;
  contentLength?: number | null;
  technicalDetails: string;
  legacy: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseStructuredEntry(line: string): ParsedChapterRepairHistoryEntry | null {
  if (!line.startsWith(`${CHAPTER_REPAIR_HISTORY_PREFIX} `)) {
    return null;
  }
  try {
    const parsed = JSON.parse(line.slice(CHAPTER_REPAIR_HISTORY_PREFIX.length).trim()) as unknown;
    if (!isRecord(parsed) || parsed.kind !== "quality_assessment" || parsed.version !== 1) {
      return null;
    }
    const entry = parsed as unknown as ChapterRepairHistoryEntry;
    return {
      ...entry,
      issueCategories: Array.isArray(entry.issueCategories) ? entry.issueCategories : [],
      riskSignals: Array.isArray(entry.riskSignals) ? entry.riskSignals : [],
      technicalDetails: typeof entry.technicalDetails === "string" ? entry.technicalDetails : line,
      legacy: false,
    };
  } catch {
    return null;
  }
}

function legacyValue(text: string, key: string): string | null {
  return text.match(new RegExp(`(?:^|\\s)${key}=([^\\s]+)`))?.[1] ?? null;
}

function parseLegacyQualityLoop(line: string): ParsedChapterRepairHistoryEntry | null {
  const match = line.match(/^\[quality_loop\s+([^\]]+)\]\s*(.*)$/);
  if (!match) {
    return null;
  }
  const details = match[2];
  const action = legacyValue(details, "action") as ChapterQualityLoopAction | null;
  const status = legacyValue(details, "status") as ChapterQualityLoopSignalStatus | null;
  const terminalAction = legacyValue(details, "terminal") === "defer_and_continue" ? "defer_and_continue" : null;
  const attemptText = legacyValue(details, "attempt");
  const attemptMatch = attemptText?.match(/^(\d+)\/(\d+)$/);
  const signalMatches = Array.from(details.matchAll(/([a-z_]+):(valid|risk|invalid|missing)/g));
  const riskSignals = signalMatches.map((item) => ({
    artifactType: item[1] as ChapterQualityLoopSignal["artifactType"],
    status: item[2] as ChapterQualityLoopSignalStatus,
    reason: "旧记录未保存详细原因。",
    issueCodes: [],
  }));
  return {
    kind: "quality_assessment",
    evaluatedAt: match[1],
    source: "pipeline_review",
    operation: "review",
    result: terminalAction && action !== "replan" && action !== "manual_gate"
      ? "deferred"
      : action === "continue"
        ? "passed"
        : "needs_action",
    overallStatus: status ?? undefined,
    recommendedAction: action ?? undefined,
    terminalAction,
    signature: legacyValue(details, "signature"),
    attempt: attemptMatch ? Number(attemptMatch[1]) : null,
    maxAttempts: attemptMatch ? Number(attemptMatch[2]) : null,
    budgetAction: legacyValue(details, "budget") as ChapterQualityLoopBudgetAction | null,
    issueCount: riskSignals.length,
    issueCategories: [],
    riskSignals,
    technicalDetails: line,
    legacy: true,
  };
}

function parseRewrite(line: string): ParsedChapterRepairHistoryEntry | null {
  const match = line.match(/^\[rewrite\]\s+(.+)$/);
  if (!match) {
    return null;
  }
  return {
    kind: "rewrite",
    evaluatedAt: match[1],
    operation: "repair",
    result: "passed",
    issueCategories: [],
    riskSignals: [],
    technicalDetails: line,
    legacy: true,
  };
}

export function parseChapterRepairHistory(value: string | null | undefined): ParsedChapterRepairHistoryEntry[] {
  if (!value?.trim()) {
    return [];
  }
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => parseStructuredEntry(line) ?? parseLegacyQualityLoop(line) ?? parseRewrite(line) ?? {
      kind: "raw" as const,
      issueCategories: [],
      riskSignals: [],
      technicalDetails: line,
      legacy: true,
    });
}

export const REPAIR_HISTORY_ARTIFACT_LABELS: Record<string, string> = {
  chapter_retention_contract: "章节留存与推进",
  continuity_state: "连续性与人物状态",
  prose_quality: "正文自然度",
  rolling_window_review: "近期章节复盘",
};

export const REPAIR_HISTORY_ACTION_LABELS: Record<string, string> = {
  continue: "检查通过",
  patch_repair: "局部修复",
  replan: "调整章节规划",
  manual_gate: "等待人工确认",
  rewrite_chapter: "整章重写",
  replan_window: "调整邻近章节",
  hard_stop: "停止自动处理",
};
