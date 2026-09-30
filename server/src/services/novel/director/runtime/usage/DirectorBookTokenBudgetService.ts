import type {
  DirectorBookTokenBudgetStatus,
  DirectorBookTokenBudgetSummary,
  DirectorBookTokenBudgetUpdateRequest,
} from "@novelfoundry/shared/types/directorRuntime";
import { prisma } from "../../../../../db/prisma";
import { AppError } from "../../../../../middleware/errorHandler";
import { directorAutomationLedgerEventService } from "../DirectorAutomationLedgerEventService";

export const DIRECTOR_BOOK_TOKEN_BUDGET_DEFAULT_WARN_RATIO = 0.8;

function normalizeWarnRatio(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DIRECTOR_BOOK_TOKEN_BUDGET_DEFAULT_WARN_RATIO;
  }
  return Math.max(0.5, Math.min(0.99, value));
}

function normalizeTokenCount(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

function resolveStatus(input: {
  limitTokens: number | null;
  usedTokens: number;
  warnRatio: number;
}): DirectorBookTokenBudgetStatus {
  if (input.limitTokens == null) {
    return "disabled";
  }
  if (input.usedTokens >= input.limitTokens) {
    return "exhausted";
  }
  if (input.usedTokens >= Math.floor(input.limitTokens * input.warnRatio)) {
    return "warning";
  }
  return "within_limit";
}

export function buildDirectorBookTokenBudgetSummary(input: {
  limitTokens?: number | null;
  warnRatio?: number | null;
  usedTokens?: number | null;
  llmCallCount?: number | null;
  lastRecordedAt?: Date | string | null;
}): DirectorBookTokenBudgetSummary {
  const limitTokens = typeof input.limitTokens === "number" && Number.isFinite(input.limitTokens)
    ? Math.max(1, Math.round(input.limitTokens))
    : null;
  const warnRatio = normalizeWarnRatio(input.warnRatio);
  const usedTokens = normalizeTokenCount(input.usedTokens);
  const llmCallCount = normalizeTokenCount(input.llmCallCount);
  const lastRecordedAt = input.lastRecordedAt
    ? new Date(input.lastRecordedAt).toISOString()
    : null;
  return {
    limitTokens,
    warnRatio,
    usedTokens,
    remainingTokens: limitTokens == null ? null : Math.max(0, limitTokens - usedTokens),
    usageRatio: limitTokens == null ? null : usedTokens / limitTokens,
    llmCallCount,
    lastRecordedAt,
    status: resolveStatus({ limitTokens, usedTokens, warnRatio }),
    trackingStatus: llmCallCount > 0 || usedTokens > 0 ? "active" : "no_usage_yet",
  };
}

function formatTokens(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value);
}

export class DirectorBookTokenBudgetService {
  async getBudgetSummary(novelId: string): Promise<DirectorBookTokenBudgetSummary> {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        id: true,
        directorTokenBudget: true,
        directorTokenBudgetWarnRatio: true,
      },
    });
    if (!novel) {
      throw new AppError("小说不存在。", 404);
    }
    const taskIds = (await prisma.novelWorkflowTask.findMany({
      where: { novelId, lane: "auto_director" },
      select: { id: true },
    })).map((task) => task.id);
    const usage = await prisma.directorLlmUsageRecord.aggregate({
      where: taskIds.length > 0
        ? {
          OR: [
            { novelId },
            { taskId: { in: taskIds } },
          ],
        }
        : { novelId },
      _count: { _all: true },
      _sum: { totalTokens: true },
      _max: { recordedAt: true },
    });
    return buildDirectorBookTokenBudgetSummary({
      limitTokens: novel.directorTokenBudget,
      warnRatio: novel.directorTokenBudgetWarnRatio,
      usedTokens: usage._sum.totalTokens,
      llmCallCount: usage._count._all,
      lastRecordedAt: usage._max.recordedAt,
    });
  }

  async updateBudget(
    novelId: string,
    input: DirectorBookTokenBudgetUpdateRequest,
  ): Promise<DirectorBookTokenBudgetSummary> {
    const result = await prisma.novel.updateMany({
      where: { id: novelId },
      data: {
        directorTokenBudget: input.limitTokens,
        ...(typeof input.warnRatio === "number"
          ? { directorTokenBudgetWarnRatio: normalizeWarnRatio(input.warnRatio) }
          : {}),
      },
    });
    if (result.count === 0) {
      throw new AppError("小说不存在。", 404);
    }
    return this.getBudgetSummary(novelId);
  }

  async evaluateBoundary(input: {
    novelId: string;
    taskId: string;
  }): Promise<DirectorBookTokenBudgetSummary> {
    const summary = await this.getBudgetSummary(input.novelId);
    if (summary.status !== "warning" && summary.status !== "exhausted") {
      return summary;
    }
    const exhausted = summary.status === "exhausted";
    await directorAutomationLedgerEventService.recordEvent({
      type: exhausted ? "token_budget_exhausted" : "token_budget_warning",
      idempotencyKey: [
        input.taskId,
        input.novelId,
        summary.limitTokens ?? "unlimited",
        summary.warnRatio,
      ].join(":"),
      taskId: input.taskId,
      novelId: input.novelId,
      nodeKey: "chapter_execution_node",
      summary: exhausted
        ? `本书自动导演已用 ${formatTokens(summary.usedTokens)} Tokens，达到 ${formatTokens(summary.limitTokens ?? 0)} Tokens 预算。`
        : `本书自动导演已用 ${formatTokens(summary.usedTokens)} Tokens，达到预算提醒线。`,
      affectedScope: "book:token_budget",
      severity: exhausted ? "high" : "medium",
      metadata: { tokenBudget: summary },
    }).catch(() => null);
    return summary;
  }
}

export const directorBookTokenBudgetService = new DirectorBookTokenBudgetService();
