import type { AuditReport, QualityScore, ReviewIssue } from "@novelfoundry/shared/types/novel";
import type { GenerationContextPackage } from "@novelfoundry/shared/types/chapterRuntime";
import { resolveLatestNarrativeScoreEvidence } from "@novelfoundry/shared/types/chapterRuntime/qualitySchemas";
import { WHOLE_BOOK_REVIEW_RUN_KIND } from "@novelfoundry/shared/types/wholeBookReview";
import { polishPrisma as prisma } from "../../modules/novel/quality/polishPersistence";
import { runStructuredPrompt } from "../../prompting/core/promptRunner";
import { AppError } from "../../middleware/errorHandler";
import {
  chapterReviewPrompt,
} from "../../prompting/prompts/novel/review.prompts";
import { ragServices } from "../rag";
import { auditService } from "../audit/AuditService";
import { payoffLedgerSyncService } from "../payoff/PayoffLedgerSyncService";
import { plannerService } from "../planner/PlannerService";
import { stateService } from "../state/StateService";
import {
  LLMGenerateOptions,
  logPipelineError,
  normalizeScore,
  RepairOptions,
  ReviewOptions,
  ruleScore,
} from "./novelCoreShared";
import { GenerationContextAssembler } from "./runtime/GenerationContextAssembler";
import { chapterQualityLoopService } from "./quality/ChapterQualityLoopService";
import { directorAutomationLedgerEventService } from "./director/runtime/DirectorAutomationLedgerEventService";
import { ChapterRuntimeCoordinator } from "./runtime/ChapterRuntimeCoordinator";
import {
  ChapterContextAssemblyError,
  type AuditContextOperation,
  assembleChapterAuditContextPackage,
} from "./runtime/repair/chapterAuditContext";

export async function createQualityReport(
  novelId: string,
  chapterId: string,
  score: QualityScore | null,
  issues: ReviewIssue[],
) {
  // Unscored attempts live in AuditReport and chapter quality debt. QualityReport
  // stores completed numeric assessments and cannot represent unavailable grades.
  if (!score) return;
  await prisma.qualityReport.create({
    data: {
      novelId,
      chapterId,
      coherence: score.coherence,
      repetition: score.repetition,
      pacing: score.pacing,
      voice: score.voice,
      engagement: score.engagement,
      overall: score.overall,
      issues: issues.length > 0 ? JSON.stringify(issues) : null,
    },
  });
}

export class NovelCoreReviewService {
  private readonly generationContextAssembler = new GenerationContextAssembler();
  private readonly chapterRuntimeCoordinator = new ChapterRuntimeCoordinator({
    resolveAuditIssues: (novelId, issueIds) => this.resolveAuditIssues(novelId, issueIds),
  });

  async reviewChapter(novelId: string, chapterId: string, options: ReviewOptions = {}) {
    const chapter = await prisma.chapter.findFirst({
      where: { id: chapterId, novelId },
      include: { novel: true },
    });
    if (!chapter) {
      throw new Error("章节不存在");
    }

    const review = await this.reviewChapterWithAudit(
      chapter.novel.title,
      chapter.title,
      options.content ?? chapter.content ?? "",
      options,
      novelId,
      chapterId,
    );

    const replanRecommendation = plannerService.buildReplanRecommendation({
      auditReports: review.auditReports ?? [],
      ledgerSummary: review.contextPackage?.ledgerSummary ?? null,
      contextPackage: review.contextPackage ?? null,
    });
    if (review.preview || (options.content !== undefined && options.content !== (chapter.content ?? ""))) {
      return { ...review, replanRecommendation: { recommended: false, reason: "修订稿审阅仅供对照。", blockingIssueIds: [] } };
    }
    const qualityAssessment = await chapterQualityLoopService.recordAssessment({
      novelId,
      chapterId,
      chapterOrder: chapter.order,
      score: review.score,
      issues: review.issues.filter((issue) => !issue.calibration || issue.calibration.repairEligible),
      source: options.content ? "repair_recheck" : "manual_review",
      replanRecommendation,
      terminalAction: replanRecommendation.recommended
        && replanRecommendation.action === "stop_for_replan"
        ? null
        : "defer_and_continue",
    });

    return { ...review, qualityAssessment, replanRecommendation };
  }

  async createRepairStream(novelId: string, chapterId: string, options: RepairOptions = {}) {
    return this.chapterRuntimeCoordinator.createRepairStream(novelId, chapterId, options);
  }

  async getNovelState(novelId: string) {
    return stateService.getNovelState(novelId);
  }

  async getLatestStateSnapshot(novelId: string) {
    return stateService.getLatestSnapshot(novelId);
  }

  async getChapterStateSnapshot(novelId: string, chapterId: string) {
    return stateService.getChapterSnapshot(novelId, chapterId);
  }

  async rebuildNovelState(novelId: string, options: LLMGenerateOptions = {}) {
    return stateService.rebuildState(novelId, options);
  }

  async generateBookPlan(novelId: string, options: LLMGenerateOptions = {}) {
    return plannerService.generateBookPlan(novelId, options);
  }

  async generateArcPlan(novelId: string, arcId: string, options: LLMGenerateOptions = {}) {
    return plannerService.generateArcPlan(novelId, arcId, options);
  }

  async generateChapterPlan(novelId: string, chapterId: string, options: LLMGenerateOptions = {}) {
    return plannerService.generateChapterPlan(novelId, chapterId, options);
  }

  async getChapterPlan(novelId: string, chapterId: string) {
    return plannerService.getChapterPlan(novelId, chapterId);
  }

  async replanNovel(
    novelId: string,
    input: {
      chapterId?: string;
      triggerType?: string;
      sourceIssueIds?: string[];
      windowSize?: number;
      reason: string;
    } & LLMGenerateOptions,
  ) {
    const result = await plannerService.replan(novelId, input);
    if (result.run) {
      await directorAutomationLedgerEventService.recordReplanRunCreated({
        novelId,
        replanRunId: result.run.id,
        affectedChapterIds: result.affectedChapterIds,
        affectedChapterOrders: result.affectedChapterOrders,
        generatedPlanIds: result.generatedPlans.map((plan) => plan.id),
        blockingLedgerKeys: result.blockingLedgerKeys ?? [],
        triggerReason: result.triggerReason || result.reason,
      }).catch(() => null);
    }
    return result;
  }

  async auditChapter(
    novelId: string,
    chapterId: string,
    scope: "full" | "continuity" | "character" | "plot" | "mode_fit",
    options: ReviewOptions = {},
  ) {
    const contextPackage = await this.assembleAuditContextPackage(novelId, chapterId, options, "audit");
    return auditService.auditChapter(novelId, chapterId, scope, {
      ...options,
      contextPackage,
      manualEvidenceReview: true,
    });
  }

  async listChapterAuditReports(novelId: string, chapterId: string) {
    return auditService.listChapterAuditReports(novelId, chapterId);
  }

  async resolveAuditIssues(novelId: string, issueIds: string[]) {
    return auditService.resolveIssues(novelId, issueIds);
  }

  async getQualityReport(novelId: string) {
    const storedReports = await prisma.qualityReport.findMany({
      where: { novelId },
      orderBy: { createdAt: "desc" },
    });
    const reports = storedReports.filter((report) => !report.issues?.includes(`"kind":"${WHOLE_BOOK_REVIEW_RUN_KIND}"`));
    const acceptanceReports = await prisma.auditReport.findMany({
      where: { novelId }, orderBy: { createdAt: "desc" },
      select: { id: true, chapterId: true, createdAt: true, legacyScoreJson: true,
        issues: { select: { code: true, auditType: true, severity: true, evidence: true, fixSuggestion: true } } },
    });
    const auditsByChapter = new Map<string, (typeof acceptanceReports)>();
    for (const report of acceptanceReports) {
      auditsByChapter.set(report.chapterId, [...(auditsByChapter.get(report.chapterId) ?? []), report]);
    }
    const latestEvidence = Array.from(auditsByChapter.entries()).flatMap(([chapterId, auditReports]) => {
      const evidence = resolveLatestNarrativeScoreEvidence(auditReports);
      return evidence ? [{ chapterId, ...evidence }] : [];
    });
    const evidencedChapterIds = new Set(latestEvidence.map((evidence) => evidence.chapterId));
    const currentReports = reports.filter((report) => !report.chapterId || !evidencedChapterIds.has(report.chapterId))
      .map((report) => ({ ...report, scoreAvailability: "legacy_unknown" as const, scoreReason: null as string | null }));
    const evidencedReports = latestEvidence.flatMap((evidence) => {
      if (!evidence.score) return [];
      const metadata = JSON.parse(evidence.report.legacyScoreJson ?? "null");
      const issues = Array.isArray(metadata?.manualReview?.issues) ? metadata.manualReview.issues
        : evidence.report.issues.map((issue) => ({
          severity: issue.severity, evidence: issue.evidence, fixSuggestion: issue.fixSuggestion,
          category: issue.auditType === "character" ? "logic" : issue.auditType === "plot" ? "pacing" : "coherence",
        }));
      return [{ ...evidence.score, id: evidence.report.id, chapterId: evidence.chapterId, novelId,
        scoreAvailability: evidence.scoreAvailability, scoreReason: evidence.scoreReason,
        issues: issues.length > 0 ? JSON.stringify(issues) : null,
        createdAt: evidence.report.createdAt, updatedAt: evidence.report.createdAt }];
    });
    const latestByChapter = new Map<string, (typeof currentReports)[number] | (typeof evidencedReports)[number]>();
    for (const report of currentReports) {
      if (report.chapterId && !latestByChapter.has(report.chapterId)) {
        latestByChapter.set(report.chapterId, report);
      }
    }
    for (const report of evidencedReports) latestByChapter.set(report.chapterId, report);
    const chapterReports = Array.from(latestByChapter.values());
    const source = chapterReports.length > 0 ? chapterReports : currentReports;
    const total = source.length;
    const unscoredChapters = latestEvidence
      .filter((evidence) => evidence.score === null)
      .map((evidence) => ({
        chapterId: evidence.chapterId, scoreAvailability: "unavailable" as const,
        scoreReason: evidence.scoreReason ?? "章节评估未完成，可重新审校。",
      }));
    if (total === 0) {
      return { novelId, summary: null, chapterReports: [], totalReports: reports.length, unscoredChapters };
    }

    const summary = normalizeScore({
      coherence: source.reduce((sum, item) => sum + item.coherence, 0) / total,
      repetition: source.reduce((sum, item) => sum + item.repetition, 0) / total,
      pacing: source.reduce((sum, item) => sum + item.pacing, 0) / total,
      voice: source.reduce((sum, item) => sum + item.voice, 0) / total,
      engagement: source.reduce((sum, item) => sum + item.engagement, 0) / total,
      overall: source.reduce((sum, item) => sum + item.overall, 0) / total,
    });

    return { novelId, summary, chapterReports: source, totalReports: reports.length, unscoredChapters };
  }

  async getPayoffLedger(novelId: string, chapterOrder?: number) {
    return payoffLedgerSyncService.getPayoffLedger(novelId, { chapterOrder });
  }

  private async reviewChapterContent(
    novelTitle: string,
    chapterTitle: string,
    content: string,
    options: ReviewOptions = {},
    novelId?: string,
  ): Promise<{ score: QualityScore; issues: ReviewIssue[] }> {
    if (!content.trim()) {
      return {
        score: normalizeScore({}),
        issues: [{
          severity: "critical",
          category: "coherence",
          evidence: "章节内容为空",
          fixSuggestion: "先生成或补充正文，再进行审校",
        }],
      };
    }

    try {
      let ragContext = "";
      if (novelId) {
        try {
          ragContext = await ragServices.hybridRetrievalService.buildContextBlock(
            `章节审校 ${novelTitle}\n${chapterTitle}\n${content.slice(0, 1500)}`,
            {
              novelId,
              ownerTypes: ["novel", "chapter", "chapter_summary", "consistency_fact", "character", "bible"],
              finalTopK: 6,
            },
          );
        } catch {
          ragContext = "";
        }
      }

      const result = await runStructuredPrompt({
        asset: chapterReviewPrompt,
        promptInput: {
          novelTitle,
          chapterTitle,
          content,
          ragContext: ragContext || "",
        },
        options: {
          provider: options.provider,
          model: options.model,
          temperature: options.temperature ?? 0.1,
        },
      });
      const parsed = result.output;

      return {
        score: normalizeScore(parsed.score ?? {}),
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      };
    } catch {
      return { score: ruleScore(content), issues: [] };
    }
  }

  private async reviewChapterWithAudit(
    novelTitle: string,
    chapterTitle: string,
    content: string,
    options: ReviewOptions = {},
    novelId?: string,
    chapterId?: string,
  ): Promise<{
    score: QualityScore;
    issues: ReviewIssue[];
    auditReports?: AuditReport[];
    contextPackage?: GenerationContextPackage;
    preview?: boolean;
  }> {
    if (!content.trim()) {
      throw new AppError("请先补充正文，再进行审稿。", 400);
    }

    if (novelId && chapterId) {
      const contextPackage = await this.assembleAuditContextPackage(novelId, chapterId, options, "review");
      const auditResult = await auditService.auditChapter(novelId, chapterId, "full", {
        provider: options.provider,
        model: options.model,
        temperature: options.temperature,
        content,
        contextPackage,
        manualEvidenceReview: true,
      });
      return {
        ...auditResult,
        contextPackage,
      };
    }

    return this.reviewChapterContent(novelTitle, chapterTitle, content, options, novelId);
  }

  private async assembleAuditContextPackage(
    novelId: string,
    chapterId: string,
    options: ReviewOptions,
    operation: AuditContextOperation,
  ): Promise<GenerationContextPackage> {
    return assembleChapterAuditContextPackage({
      assembler: this.generationContextAssembler,
      novelId,
      chapterId,
      options,
      operation,
    });
  }
}
