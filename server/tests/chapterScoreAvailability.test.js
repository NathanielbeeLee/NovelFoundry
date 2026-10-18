const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveQualityScoreState, isUnavailableQualityScoreReport, resolveLatestNarrativeScoreEvidence } = require("../../shared/dist/types/chapterRuntime/qualitySchemas.js");
const { buildChapterQualityLoopAssessment, classifyChapterQualityLoopRiskFlags } = require("../../shared/dist/types/chapterQualityLoop.js");
const { ChapterAcceptanceAssessmentService, normalizeAssessment } = require("../dist/services/novel/runtime/ChapterAcceptanceAssessmentService.js");
const { buildChapterQualityLoopChapterUpdate } = require("../dist/services/novel/quality/ChapterQualityLoopService.js");
const proseQuality = require("../dist/services/novel/runtime/proseQuality/ProseQualityDetector.js");
const { openConflictService } = require("../dist/services/state/OpenConflictService.js");
const { consumeLlmRequestBudget } = require("../dist/llm/requestBudget/index.js");
const { prisma } = require("../dist/db/prisma.js");
const { AuditService } = require("../dist/services/audit/AuditService.js");
const { NovelCoreReviewService } = require("../dist/services/novel/novelCoreReviewService.js");

const score = { coherence: 91, repetition: 90, pacing: 89, voice: 88, engagement: 92, overall: 90 };
const assessment = () => ({
  status: "accepted", score, summary: "Complete narrative assessment", blockingIssues: [],
  repairDirectives: [], missingObligations: [], repairability: "none", decisionReason: "Ready",
  riskTags: [], continuePolicy: "continue",
  assetSyncRecommendation: { priority: "normal", reason: "Ready", requiresFullPayoffReconcile: false },
});
const input = () => ({
  novelId: "fixture-novel", chapterId: "fixture-chapter", novelTitle: "Fixture book",
  chapterTitle: "Arrival", chapterOrder: 1, content: "门开了，他走进屋内。", contextPackage: {},
});

test("missing narrative score stays unscored regardless of prose length", () => {
  for (const content of ["文字。", "文字。".repeat(4000)]) {
    const normalized = normalizeAssessment({ ...assessment(), score: undefined }, content);
    assert.equal(normalized.score, null);
    assert.equal(normalized.scoreAvailability, "unavailable");
    assert.equal(normalized.status, "continue_with_risk");
    assert.equal(normalized.continuePolicy, "continue");
    assert.deepEqual(normalized.repairDirectives, []);
  }
});

test("legacy unavailable numeric records never become usable narrative grades", () => {
  for (const override of [
    { scoreAvailability: "unavailable" },
    { riskTags: ["acceptance_gate_unavailable"] },
    { openIssues: [{ code: "acceptance_gate_unavailable" }] },
    { reports: [{ legacyScoreJson: JSON.stringify({ ...score, riskTags: ["acceptance_gate_unavailable"] }) }] },
    { reports: [{ issues: [{ code: "acceptance_gate_unavailable" }] }] },
  ]) {
    assert.equal(resolveQualityScoreState({ score, ...override }).score, null);
  }
  assert.equal(resolveQualityScoreState({ score }).scoreAvailability, "legacy_unknown");
  assert.equal(resolveQualityScoreState({ score, scoreAvailability: "available" }).score.overall, 90);
  assert.equal(isUnavailableQualityScoreReport({ legacyScoreJson: "broken" }), false);
});

test("exhausted acceptance budget persists an unscored continuable assessment", async (t) => {
  const previousSync = openConflictService.syncFromAuditReports;
  t.after(() => { openConflictService.syncFromAuditReports = previousSync; });
  openConflictService.syncFromAuditReports = async () => null;
  const service = new ChapterAcceptanceAssessmentService();
  let attempted = 0;
  service.invokeAssessment = async () => {
    for (let i = 0; i < 9; i += 1) { consumeLlmRequestBudget(); attempted += 1; }
    return assessment();
  };
  let persisted;
  service.persistAcceptanceReports = async (_input, output, resultScore) => {
    persisted = { output, score: resultScore }; return [];
  };
  const result = await service.assess(input());
  assert.equal(attempted, 8);
  assert.equal(result.score, null);
  assert.equal(result.scoreAvailability, "unavailable");
  assert.equal(result.assessment.continuePolicy, "continue");
  assert.equal(result.assessment.repairability, "none");
  assert.equal(persisted.score, null);
  assert.equal(persisted.output.scoreReason.length > 0, true);
});

test("secondary prose checker failure preserves valid narrative AI scores", async (t) => {
  const previousSync = openConflictService.syncFromAuditReports;
  const previousCheck = proseQuality.tryDetectProseQuality;
  t.after(() => {
    openConflictService.syncFromAuditReports = previousSync;
    proseQuality.tryDetectProseQuality = previousCheck;
  });
  openConflictService.syncFromAuditReports = async () => null;
  assert.equal(proseQuality.tryDetectProseQuality(null), null);
  proseQuality.tryDetectProseQuality = () => null;
  const service = new ChapterAcceptanceAssessmentService();
  service.invokeAssessment = async () => assessment();
  service.persistAcceptanceReports = async () => [];
  const result = await service.assess(input());
  assert.deepEqual(result.score, score);
  assert.equal(result.scoreAvailability, "available");
  assert.equal(result.assessment.status, "accepted");
  assert.equal(result.assessment.riskTags.includes("prose_check_unavailable"), true);
});

test("unscored quality-loop closes as visible debt without repair, pause, or replan", () => {
  const result = buildChapterQualityLoopAssessment({ chapterId: "fixture-chapter", score: null, issues: [] });
  assert.equal(result.overallStatus, "missing");
  assert.equal(result.recommendedAction, "continue");
  assert.equal(result.patchFirstRequired, false);
  assert.equal(result.pauseReason, null);
  assert.equal(result.recheckRequired, true);
  const update = buildChapterQualityLoopChapterUpdate({
    content: "Retained prose", chapterStatus: "needs_repair", generationState: "reviewed",
    riskFlags: null, repairHistory: null,
  }, result, "pipeline_review", "defer_and_continue", null, { scoreAfter: null });
  assert.equal(update.chapterStatus, "completed");
  assert.equal(classifyChapterQualityLoopRiskFlags(update.riskFlags), "non_blocking_quality_debt");
  const stored = JSON.parse(update.riskFlags).qualityLoop;
  assert.equal(stored.scoreAvailability, "unavailable");
  assert.equal(stored.scoreReason.length > 0, true);
  assert.match(update.repairHistory, /"scoreAfter":null/);
});

test("raw report read suppresses legacy unavailable numeric values", async (t) => {
  const previousRead = prisma.auditReport.findMany;
  t.after(() => { prisma.auditReport.findMany = previousRead; });
  prisma.auditReport.findMany = async () => [{
    id: "old-fallback", overallScore: 83,
    legacyScoreJson: JSON.stringify({ ...score, riskTags: ["acceptance_gate_unavailable"] }), issues: [],
  }, { id: "valid", overallScore: 90, legacyScoreJson: JSON.stringify(score), issues: [] }];
  const rows = await new AuditService().listChapterAuditReports("fixture-novel", "fixture-chapter");
  assert.equal(rows[0].overallScore, null);
  assert.equal(rows[1].overallScore, 90);
});

test("successful assessment replaces an unavailable report set across changed audit categories while preserving manual reports", async (t) => {
  const originalTransaction = prisma.$transaction;
  const originalRead = prisma.auditReport.findMany;
  t.after(() => { prisma.$transaction = originalTransaction; prisma.auditReport.findMany = originalRead; });
  let reports = [
    { id: "old-auto", auditType: "mode_fit", overallScore: 83, legacyScoreJson: JSON.stringify({
      acceptanceStatus: "continue_with_risk", riskTags: ["acceptance_gate_unavailable"],
    }) },
    { id: "manual", auditType: "mode_fit", overallScore: 92, legacyScoreJson: JSON.stringify({ manualReview: { sourceContentHash: "hash" } }) },
    { id: "other-owner", auditType: "plot", overallScore: 88, legacyScoreJson: JSON.stringify(score) },
  ];
  prisma.$transaction = async (run) => run({ auditReport: {
    findMany: async () => reports,
    deleteMany: async ({ where }) => { reports = reports.filter((report) => !where.id.in.includes(report.id)); },
    create: async ({ data }) => {
      const report = { ...data, id: "new-auto", issues: [] }; reports.push(report); return report;
    },
  } });
  prisma.auditReport.findMany = async ({ where }) => reports.filter((report) => where.id.in.includes(report.id));
  const normalized = normalizeAssessment({ ...assessment(), blockingIssues: [{
    severity: "medium", category: "continuity", code: "continuity_hint", evidence: "Door state", fixSuggestion: "Clarify",
  }] }, input().content);
  const result = await new ChapterAcceptanceAssessmentService().persistAcceptanceReports(input(), normalized, normalized.score);
  assert.deepEqual(reports.map((report) => report.id).sort(), ["manual", "new-auto", "other-owner"]);
  assert.deepEqual(result.map((report) => report.id), ["new-auto"]);
  assert.equal(result[0].auditType, "continuity");
  assert.equal(resolveQualityScoreState({ score, reports: result }).score.overall, 90);
});

test("current quality report hides historical numeric scores after an unscored attempt and accepts a newer manual score", async (t) => {
  const originalQualityRead = prisma.qualityReport.findMany;
  const originalAuditRead = prisma.auditReport.findMany;
  t.after(() => { prisma.qualityReport.findMany = originalQualityRead; prisma.auditReport.findMany = originalAuditRead; });
  let createdAt = new Date("2026-10-18T00:00:00.000Z");
  let manualEvidence = false;
  prisma.qualityReport.findMany = async () => [{ id: "historical-grade", chapterId: "chapter-1", ...score, issues: null, createdAt }];
  prisma.auditReport.findMany = async () => [...(manualEvidence ? [{ id: "manual-evidence", chapterId: "chapter-1",
    createdAt: new Date("2026-10-18T00:03:00.000Z"), legacyScoreJson: JSON.stringify({ ...score, manualReview: {} }), issues: [],
  }] : []), { id: "unavailable-evidence", chapterId: "chapter-1", createdAt: new Date("2026-10-18T00:01:00.000Z"),
    legacyScoreJson: JSON.stringify({ acceptanceStatus: "continue_with_risk", scoreAvailability: "unavailable" }), issues: [],
  }];
  const service = new NovelCoreReviewService();
  const unavailable = await service.getQualityReport("fixture-novel");
  assert.equal(unavailable.summary, null);
  assert.deepEqual(unavailable.chapterReports, []);
  assert.equal(unavailable.unscoredChapters[0].scoreAvailability, "unavailable");
  assert.equal(unavailable.totalReports, 1);
  createdAt = new Date("2026-10-18T00:02:00.000Z");
  const legacyFallback = await service.getQualityReport("fixture-novel");
  assert.equal(legacyFallback.summary, null, "a legacy fallback numeric row can postdate unavailable audit evidence");
  assert.deepEqual(legacyFallback.chapterReports, []);
  manualEvidence = true;
  const manual = await service.getQualityReport("fixture-novel");
  assert.equal(manual.summary.overall, 90);
  assert.equal(manual.chapterReports[0].id, "manual-evidence");
  assert.equal(manual.chapterReports[0].scoreAvailability, "available");
  assert.deepEqual(manual.unscoredChapters, []);
});

test("report-only audit view uses newer manual narrative evidence over retained unavailable automatic categories", () => {
  const evidence = resolveLatestNarrativeScoreEvidence([
    { id: "old-auto-mode-fit", auditType: "mode_fit", overallScore: null, createdAt: "2026-10-18T00:01:00.000Z",
      legacyScoreJson: JSON.stringify({ acceptanceStatus: "continue_with_risk", scoreAvailability: "unavailable" }), issues: [] },
    { id: "new-manual-continuity", auditType: "continuity", overallScore: 90, createdAt: "2026-10-18T00:02:00.000Z",
      legacyScoreJson: JSON.stringify({ ...score, manualReview: { sourceContentHash: "current" } }), issues: [] },
  ]);
  assert.equal(evidence.report.id, "new-manual-continuity");
  assert.equal(evidence.score.overall, 90);
  assert.equal(evidence.scoreAvailability, "available");
});

test("an unavailable secondary prose check requires later review while preserving the narrative grade", () => {
  const result = buildChapterQualityLoopAssessment({ chapterId: "chapter-1", chapterOrder: 1, score, issues: [], runtimePackage: {
    audit: { score, reports: [], openIssues: [] }, meta: { riskTags: ["prose_check_unavailable"] },
    failureClassification: { code: "none", blockingObligations: [] },
  } });
  assert.equal(result.scoreAvailability, "legacy_unknown");
  assert.equal(result.recommendedAction, "continue");
  assert.equal(result.recheckRequired, true);
  assert.equal(result.signals.find((signal) => signal.artifactType === "prose_quality").status, "missing");
});
