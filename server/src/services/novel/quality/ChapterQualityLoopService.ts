import type { ChapterRuntimePackage } from "@novelfoundry/shared/types/chapterRuntime";
import type { QualityScore, ReplanRecommendation, ReviewIssue } from "@novelfoundry/shared/types/novel";
import type { Prisma } from "@prisma/client";
import {
  CHAPTER_REPAIR_HISTORY_PREFIX,
  buildChapterQualityLoopAssessment,
  type ChapterQualityLoopAssessment,
  type ChapterRepairHistoryEntry,
} from "@novelfoundry/shared/types/chapterQualityLoop";
import { polishPrisma as prisma } from "../../../modules/novel/quality/polishPersistence";
import { directorAutomationLedgerEventService } from "../director/runtime/DirectorAutomationLedgerEventService";
import type { QualityDebtAttribution } from "../runtime/chapterRuntimePipeline";
import { chapterLifecycleService } from "../runtime/lifecycle/ChapterLifecycleService";

interface RecordChapterQualityLoopInput {
  novelId: string;
  chapterId: string;
  chapterOrder?: number | null;
  score: QualityScore;
  issues: ReviewIssue[];
  runtimePackage?: ChapterRuntimePackage | null;
  replanRecommendation?: ReplanRecommendation | null;
  source: "manual_review" | "pipeline_review" | "repair_recheck";
  terminalAction?: "defer_and_continue" | null;
  taskId?: string | null;
  runId?: string | null;
  /** 阶段0 归因数据：仅在 terminalAction=defer_and_continue 时有意义 */
  qualityDebtAttribution?: QualityDebtAttribution | null;
}

type ChapterQualityLoopChapter = {
  content?: string | null;
  riskFlags: string | null;
  repairHistory: string | null;
  chapterStatus: string | null;
  generationState?: string | null;
};

interface ChapterRepairHistoryContext {
  issueCount?: number;
  issueCategories?: string[];
  scoreBefore?: QualityScore | null;
  scoreAfter?: QualityScore | null;
  qualityReportId?: string | null;
  contentVersion?: string | null;
  contentLength?: number | null;
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value?.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function serializeRiskFlags(
  previous: string | null | undefined,
  assessment: ChapterQualityLoopAssessment,
  source: RecordChapterQualityLoopInput["source"],
  terminalAction?: RecordChapterQualityLoopInput["terminalAction"],
  qualityDebtAttribution?: RecordChapterQualityLoopInput["qualityDebtAttribution"],
): string {
  const parsed = parseJsonObject(previous);
  return JSON.stringify({
    ...parsed,
    qualityLoop: {
      ...assessment,
      source,
      ...(terminalAction ? { terminalAction } : {}),
      ...(qualityDebtAttribution ? { qualityDebtAttribution } : {}),
    },
  });
}

function appendRepairHistory(
  previous: string | null | undefined,
  assessment: ChapterQualityLoopAssessment,
  source: RecordChapterQualityLoopInput["source"],
  terminalAction?: RecordChapterQualityLoopInput["terminalAction"],
  context: ChapterRepairHistoryContext = {},
): string | undefined {
  if (assessment.recommendedAction === "continue" && source !== "repair_recheck") {
    return undefined;
  }
  const technicalDetails = [
    `[quality_loop ${assessment.evaluatedAt}]`,
    `status=${assessment.overallStatus}`,
    `action=${assessment.recommendedAction}`,
    terminalAction ? `terminal=${terminalAction}` : "",
    assessment.signals
      .filter((signal) => signal.status !== "valid")
      .map((signal) => `${signal.artifactType}:${signal.status}`)
      .join(","),
  ].filter(Boolean).join(" ");
  const entry: ChapterRepairHistoryEntry = {
    version: 1,
    kind: "quality_assessment",
    evaluatedAt: assessment.evaluatedAt,
    source,
    operation: source === "repair_recheck" ? "repair" : "review",
    result: terminalAction === "defer_and_continue"
      && assessment.recommendedAction !== "replan"
      && assessment.recommendedAction !== "manual_gate"
      ? "deferred"
      : assessment.recommendedAction === "continue"
        ? "passed"
        : "needs_action",
    overallStatus: assessment.overallStatus,
    recommendedAction: assessment.recommendedAction,
    terminalAction: terminalAction ?? null,
    issueCount: context.issueCount ?? 0,
    issueCategories: context.issueCategories ?? [],
    riskSignals: assessment.signals.filter((signal) => signal.status !== "valid"),
    scoreBefore: context.scoreBefore ?? null,
    scoreAfter: context.scoreAfter ?? null,
    qualityReportId: context.qualityReportId ?? null,
    contentVersion: context.contentVersion ?? null,
    contentLength: context.contentLength ?? null,
    technicalDetails,
  };
  const line = `${CHAPTER_REPAIR_HISTORY_PREFIX} ${JSON.stringify(entry)}`;
  const lines = [
    ...(previous?.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) ?? []),
    line,
  ].slice(-12);
  return lines.join("\n");
}

function resolveContinuableChapterState(
  chapter: Pick<ChapterQualityLoopChapter, "content" | "chapterStatus" | "generationState">,
): Pick<Prisma.ChapterUpdateInput, "chapterStatus" | "generationState"> {
  if (!chapter.content?.trim()) {
    return {};
  }
  return {
    chapterStatus: "completed",
    generationState: "approved",
  };
}

function resolveBlockedChapterState(
  source: RecordChapterQualityLoopInput["source"],
): Pick<Prisma.ChapterUpdateInput, "chapterStatus" | "generationState"> {
  return {
    chapterStatus: "needs_repair",
    ...(source === "pipeline_review" ? {} : { generationState: "reviewed" }),
  };
}

export function buildChapterQualityLoopChapterUpdate(
  chapter: ChapterQualityLoopChapter,
  assessment: ChapterQualityLoopAssessment,
  source: RecordChapterQualityLoopInput["source"],
  terminalAction?: RecordChapterQualityLoopInput["terminalAction"],
  qualityDebtAttribution?: RecordChapterQualityLoopInput["qualityDebtAttribution"],
  historyContext?: ChapterRepairHistoryContext,
): Prisma.ChapterUpdateInput {
  if (assessment.recommendedAction === "replan" || assessment.rootCauseCode === "replan_required") {
    terminalAction = null;
  }
  const nextRepairHistory = appendRepairHistory(chapter.repairHistory, assessment, source, terminalAction, historyContext);
  const shouldContinueChapter = assessment.recommendedAction === "continue" || terminalAction === "defer_and_continue";
  const continuableChapterState = shouldContinueChapter
    ? resolveContinuableChapterState(chapter)
    : {};
  return {
    riskFlags: serializeRiskFlags(chapter.riskFlags, assessment, source, terminalAction, qualityDebtAttribution),
    ...(nextRepairHistory !== undefined ? { repairHistory: nextRepairHistory } : {}),
    ...(shouldContinueChapter ? continuableChapterState : resolveBlockedChapterState(source)),
  };
}

export class ChapterQualityLoopService {
  async recordAssessment(input: RecordChapterQualityLoopInput): Promise<ChapterQualityLoopAssessment> {
    const chapter = await prisma.chapter.findFirst({
      where: { id: input.chapterId, novelId: input.novelId },
      select: {
        id: true,
        order: true,
        content: true,
        riskFlags: true,
        repairHistory: true,
        chapterStatus: true,
        generationState: true,
        updatedAt: true,
      },
    });
    if (!chapter) {
      throw new Error("章节不存在，无法记录质量闭环状态。");
    }

    const assessment = buildChapterQualityLoopAssessment({
      chapterId: input.chapterId,
      chapterOrder: input.chapterOrder ?? chapter.order,
      score: input.score,
      issues: input.issues,
      runtimePackage: input.runtimePackage,
      replanRecommendation: input.replanRecommendation,
    });
    const qualityReports = await prisma.qualityReport.findMany({
      where: { novelId: input.novelId, chapterId: input.chapterId },
      orderBy: { createdAt: "desc" },
      take: 2,
      select: {
        id: true,
        coherence: true,
        repetition: true,
        pacing: true,
        voice: true,
        engagement: true,
        overall: true,
      },
    });
    const previousScore = qualityReports[1]
      ? {
          coherence: qualityReports[1].coherence,
          repetition: qualityReports[1].repetition,
          pacing: qualityReports[1].pacing,
          voice: qualityReports[1].voice,
          engagement: qualityReports[1].engagement,
          overall: qualityReports[1].overall,
        }
      : null;
    const terminalAction = assessment.recommendedAction === "continue" ? null : input.terminalAction ?? null;
    await chapterLifecycleService.applyQualityAssessmentState({
      chapterId: input.chapterId,
      data: buildChapterQualityLoopChapterUpdate(
        chapter,
        assessment,
        input.source,
        terminalAction,
        input.qualityDebtAttribution,
        {
          issueCount: input.issues.length,
          issueCategories: Array.from(new Set(input.issues.map((issue) => issue.category))),
          scoreBefore: previousScore,
          scoreAfter: input.score,
          qualityReportId: qualityReports[0]?.id ?? null,
          contentVersion: chapter.updatedAt.toISOString(),
          contentLength: (chapter.content ?? "").replace(/\s/g, "").length,
        },
      ),
    });
    await directorAutomationLedgerEventService.recordQualityLoopAssessment({
      taskId: input.taskId,
      runId: input.runId,
      novelId: input.novelId,
      assessment,
    }).catch(() => null);
    return assessment;
  }
}

export const chapterQualityLoopService = new ChapterQualityLoopService();
