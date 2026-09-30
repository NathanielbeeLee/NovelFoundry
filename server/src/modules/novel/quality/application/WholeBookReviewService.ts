import { createHash, randomUUID } from "node:crypto";
import type {
  WholeBookReviewReport,
  WholeBookReviewStatus,
} from "@novelfoundry/shared/types/wholeBookReview";
import { prisma } from "../../../../db/prisma";
import { AppError } from "../../../../middleware/errorHandler";
import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { wholeBookRangeReviewPrompt, wholeBookReviewPrompt } from "../../../../prompting/prompts/novel/wholeBookReview.prompts";
import {
  findActiveWholeBookReviewRun,
  WHOLE_BOOK_REVIEW_RUN_MARKER,
  type StoredWholeBookReviewRunPayload,
} from "./wholeBookReviewRunState";

const REPORT_MARKER = "whole_book_review_v1";

interface StoredPayload extends Omit<WholeBookReviewReport, "id" | "novelId" | "createdAt"> {
  kind: typeof REPORT_MARKER;
}

interface ReviewRange {
  startOrder: number;
  endOrder: number;
}

function parseReport(row: { id: string; novelId: string; issues: string | null; createdAt: Date }): WholeBookReviewReport | null {
  try {
    const payload = JSON.parse(row.issues ?? "") as StoredPayload;
    if (payload.kind !== REPORT_MARKER) return null;
    return { ...payload, id: row.id, novelId: row.novelId, createdAt: row.createdAt.toISOString() };
  } catch {
    return null;
  }
}

function buildSourceRevision(input: {
  novelUpdatedAt: Date;
  characters: Array<{ id: string; updatedAt: Date }>;
  chapters: Array<{ id: string; order: number; updatedAt: Date }>;
  chapterSummaries: Array<{ chapterId: string; updatedAt: Date }>;
}): string {
  const serialized = JSON.stringify({
    novelUpdatedAt: input.novelUpdatedAt.toISOString(),
    characters: input.characters.map((item) => [item.id, item.updatedAt.toISOString()]),
    chapters: input.chapters.map((item) => [item.id, item.order, item.updatedAt.toISOString()]),
    chapterSummaries: input.chapterSummaries.map((item) => [item.chapterId, item.updatedAt.toISOString()]),
  });
  return createHash("sha256").update(serialized).digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "全书审校失败。";
}

export class WholeBookReviewService {
  private static readonly startLocks = new Set<string>();

  private async withStartLock<T>(novelId: string, runner: () => Promise<T>): Promise<T> {
    while (WholeBookReviewService.startLocks.has(novelId)) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    WholeBookReviewService.startLocks.add(novelId);
    try {
      return await runner();
    } finally {
      WholeBookReviewService.startLocks.delete(novelId);
    }
  }

  private async resolveRange(novelId: string, input: { startOrder?: number; endOrder?: number }): Promise<ReviewRange> {
    const stats = await prisma.chapter.aggregate({
      where: { novelId },
      _min: { order: true },
      _max: { order: true },
      _count: { order: true },
    });
    if ((stats._count.order ?? 0) === 0) {
      throw new AppError("当前小说还没有可审校的章节。", 400);
    }
    const minOrder = stats._min.order ?? 1;
    const maxOrder = stats._max.order ?? minOrder;
    const startOrder = Math.max(minOrder, input.startOrder ?? minOrder);
    const endOrder = Math.min(maxOrder, Math.max(startOrder, input.endOrder ?? maxOrder));
    if (startOrder > maxOrder) {
      throw new AppError(`指定范围内没有可审校的章节。当前可用范围为第 ${minOrder} 章到第 ${maxOrder} 章。`, 400);
    }
    return { startOrder, endOrder };
  }

  private async findBlockingPipelineJob(novelId: string, range: ReviewRange) {
    return prisma.generationJob.findFirst({
      where: {
        novelId,
        status: { in: ["queued", "running"] },
        pendingManualRecovery: false,
        startOrder: { lte: range.endOrder },
        endOrder: { gte: range.startOrder },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        status: true,
        startOrder: true,
        endOrder: true,
        completedCount: true,
        totalCount: true,
        currentItemLabel: true,
      },
    });
  }

  async list(novelId: string): Promise<WholeBookReviewReport[]> {
    const rows = await prisma.qualityReport.findMany({
      where: { novelId, chapterId: null },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    return rows.map(parseReport).filter((item): item is WholeBookReviewReport => Boolean(item)).slice(0, 20);
  }

  async getStatus(novelId: string, input: { startOrder?: number; endOrder?: number }): Promise<WholeBookReviewStatus> {
    const range = await this.resolveRange(novelId, input);
    const [activeRun, blockingPipelineJob, reports] = await Promise.all([
      findActiveWholeBookReviewRun(novelId),
      this.findBlockingPipelineJob(novelId, range),
      this.list(novelId),
    ]);
    const latestReport = reports[0] ?? null;
    let contentChangedSinceLatest: boolean | null = null;
    if (
      latestReport?.sourceRevision
      && latestReport.startOrder === range.startOrder
      && latestReport.endOrder === range.endOrder
    ) {
      const source = await prisma.novel.findUnique({
        where: { id: novelId },
        select: {
          updatedAt: true,
          characters: { select: { id: true, updatedAt: true }, orderBy: { id: "asc" } },
          chapters: {
            where: { order: { gte: range.startOrder, lte: range.endOrder } },
            select: { id: true, order: true, updatedAt: true },
            orderBy: { order: "asc" },
          },
          chapterSummaries: { select: { chapterId: true, updatedAt: true }, orderBy: { chapterId: "asc" } },
        },
      });
      if (source) {
        const chapterIds = new Set(source.chapters.map((chapter) => chapter.id));
        const revision = buildSourceRevision({
          novelUpdatedAt: source.updatedAt,
          characters: source.characters,
          chapters: source.chapters,
          chapterSummaries: source.chapterSummaries.filter((item) => chapterIds.has(item.chapterId)),
        });
        contentChangedSinceLatest = revision !== latestReport.sourceRevision;
      }
    }
    return {
      activeRun: activeRun
        ? {
            id: activeRun.id,
            novelId: activeRun.novelId,
            status: "running",
            startOrder: activeRun.startOrder,
            endOrder: activeRun.endOrder,
            startedAt: activeRun.startedAt,
            updatedAt: activeRun.updatedAt.toISOString(),
          }
        : null,
      blockingPipelineJob: blockingPipelineJob
        ? {
            ...blockingPipelineJob,
            status: blockingPipelineJob.status as "queued" | "running",
          }
        : null,
      latestReport,
      contentChangedSinceLatest,
    };
  }

  async run(novelId: string, input: { startOrder?: number; endOrder?: number }): Promise<WholeBookReviewReport> {
    const prepared = await this.withStartLock(novelId, async () => {
      const range = await this.resolveRange(novelId, input);
      const [activeRun, blockingPipelineJob] = await Promise.all([
        findActiveWholeBookReviewRun(novelId),
        this.findBlockingPipelineJob(novelId, range),
      ]);
      if (activeRun) {
        throw new AppError(
          `第 ${activeRun.startOrder}—${activeRun.endOrder} 章正在进行全书审校，请等待当前审校完成。`,
          409,
          { runId: activeRun.id },
        );
      }
      if (blockingPipelineJob) {
        throw new AppError(
          "所选章节正在批量润色，请等待润色完成后再开始全书审校。",
          409,
          { pipelineJobId: blockingPipelineJob.id },
        );
      }

      const novel = await prisma.novel.findUnique({
        where: { id: novelId },
        select: {
          title: true,
          description: true,
          outline: true,
          structuredOutline: true,
          updatedAt: true,
          characters: {
            select: {
              id: true,
              name: true,
              role: true,
              castRole: true,
              importanceTier: true,
              currentState: true,
              currentGoal: true,
              updatedAt: true,
            },
            orderBy: { id: "asc" },
          },
          chapters: {
            where: { order: { gte: range.startOrder, lte: range.endOrder } },
            orderBy: { order: "asc" },
            select: {
              id: true,
              order: true,
              title: true,
              content: true,
              expectation: true,
              chapterStatus: true,
              updatedAt: true,
            },
          },
          chapterSummaries: {
            select: {
              chapterId: true,
              summary: true,
              keyEvents: true,
              characterStates: true,
              hook: true,
              updatedAt: true,
            },
            orderBy: { chapterId: "asc" },
          },
        },
      });
      if (!novel || novel.chapters.length === 0) {
        throw new AppError("指定范围内没有可审校的章节。", 400);
      }
      const chapterIds = new Set(novel.chapters.map((chapter) => chapter.id));
      const sourceRevision = buildSourceRevision({
        novelUpdatedAt: novel.updatedAt,
        characters: novel.characters,
        chapters: novel.chapters,
        chapterSummaries: novel.chapterSummaries.filter((item) => chapterIds.has(item.chapterId)),
      });
      const startedAt = new Date().toISOString();
      const runPayload: StoredWholeBookReviewRunPayload = {
        kind: WHOLE_BOOK_REVIEW_RUN_MARKER,
        status: "running",
        startOrder: range.startOrder,
        endOrder: range.endOrder,
        sourceRevision,
        startedAt,
      };
      const row = await prisma.qualityReport.create({
        data: {
          novelId,
          chapterId: null,
          coherence: 0,
          repetition: 0,
          pacing: 0,
          voice: 0,
          engagement: 0,
          overall: 0,
          issues: JSON.stringify(runPayload),
        },
      });
      return { range, novel, sourceRevision, runPayload, row };
    });

    const { range, novel, sourceRevision, row } = prepared;
    try {
      const summaryByChapterId = new Map(novel.chapterSummaries.map((item) => [item.chapterId, item]));
      const bookContract = {
        description: novel.description,
        outline: novel.outline,
        structuredOutline: novel.structuredOutline,
      };
      const ranges = Array.from(
        { length: Math.ceil(novel.chapters.length / 12) },
        (_, index) => novel.chapters.slice(index * 12, index * 12 + 12),
      );
      const rangeReports = [];
      for (const rangeChapters of ranges) {
        const rangeStart = rangeChapters[0].order;
        const rangeEnd = rangeChapters.at(-1)!.order;
        const rangeEvidence = {
          bookContract,
          characters: novel.characters,
          chapters: rangeChapters.map((chapter) => {
            const summary = summaryByChapterId.get(chapter.id);
            return {
              order: chapter.order,
              title: chapter.title,
              expectation: chapter.expectation,
              status: chapter.chapterStatus,
              summary,
              opening: (chapter.content ?? "").slice(0, 700),
              ending: (chapter.content ?? "").slice(-700),
            };
          }),
        };
        const rangeResult = await runStructuredPrompt({
          asset: wholeBookRangeReviewPrompt,
          promptInput: { title: novel.title, startOrder: rangeStart, endOrder: rangeEnd, evidenceJson: JSON.stringify(rangeEvidence) },
          options: { temperature: 0.1, maxTokens: 3000, entrypoint: "whole_book_range_review", scope: novelId, triggerReason: "whole_book_review_range" },
        });
        rangeReports.push({ startOrder: rangeStart, endOrder: rangeEnd, report: rangeResult.output });
        await prisma.qualityReport.update({ where: { id: row.id }, data: { issues: JSON.stringify(prepared.runPayload) } });
      }
      const result = await runStructuredPrompt({
        asset: wholeBookReviewPrompt,
        promptInput: {
          title: novel.title,
          startOrder: range.startOrder,
          endOrder: range.endOrder,
          evidenceJson: JSON.stringify({ bookContract, characters: novel.characters, rangeReports }),
        },
        options: { temperature: 0.15, maxTokens: 4200, entrypoint: "whole_book_review", scope: novelId, triggerReason: "user_requested_whole_book_review" },
      });
      const output = result.output;
      const payload: StoredPayload = {
        kind: REPORT_MARKER,
        startOrder: range.startOrder,
        endOrder: range.endOrder,
        summary: output.summary,
        strengths: output.strengths,
        scores: output.scores,
        issues: output.issues.map((issue) => ({ ...issue, id: randomUUID(), applied: false })),
        sourceRevision,
      };
      const updated = await prisma.qualityReport.update({
        where: { id: row.id },
        data: {
          coherence: output.scores.continuity,
          repetition: output.scores.payoff,
          pacing: output.scores.pacing,
          voice: output.scores.voice,
          engagement: output.scores.plot,
          overall: output.scores.overall,
          issues: JSON.stringify(payload),
        },
      });
      return { ...payload, id: updated.id, novelId, createdAt: updated.createdAt.toISOString() };
    } catch (error) {
      const failedPayload: StoredWholeBookReviewRunPayload = {
        ...prepared.runPayload,
        status: "failed",
        failureMessage: errorMessage(error),
      };
      await prisma.qualityReport.update({
        where: { id: row.id },
        data: { issues: JSON.stringify(failedPayload) },
      }).catch(() => undefined);
      throw error;
    }
  }

  async applyFeedback(novelId: string, reportId: string, issueIds?: string[]): Promise<{ applied: number }> {
    const row = await prisma.qualityReport.findFirst({ where: { id: reportId, novelId, chapterId: null } });
    const report = row ? parseReport(row) : null;
    if (!row || !report) throw new AppError("全书审校报告不存在。", 404);
    const selected = report.issues.filter((issue) => !issueIds?.length || issueIds.includes(issue.id));
    let applied = 0;
    for (const issue of selected) {
      const exists = await prisma.creativeDecision.findFirst({ where: { novelId, sourceType: "whole_book_review", sourceRefId: issue.id } });
      if (exists) continue;
      await prisma.creativeDecision.create({
        data: {
          novelId,
          category: `全书审校/${issue.category}`,
          content: issue.feedback,
          importance: issue.severity === "high" ? "high" : "normal",
          sourceType: "whole_book_review",
          sourceRefId: issue.id,
        },
      });
      issue.applied = true;
      applied += 1;
    }
    const payload: StoredPayload = {
      kind: REPORT_MARKER,
      startOrder: report.startOrder,
      endOrder: report.endOrder,
      summary: report.summary,
      strengths: report.strengths,
      scores: report.scores,
      issues: report.issues,
      sourceRevision: report.sourceRevision,
    };
    await prisma.qualityReport.update({ where: { id: row.id }, data: { issues: JSON.stringify(payload) } });
    return { applied };
  }
}
