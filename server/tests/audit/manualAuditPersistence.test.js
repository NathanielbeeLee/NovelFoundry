const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const dist = path.resolve(__dirname, "../../dist");
function stub(relative, exports) {
  const file = require.resolve(path.join(dist, relative));
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

let fixture;
const db = {
  chapter: { findFirst: async () => ({ id: "c", novelId: "n", order: 1, title: "Chapter", content: fixture.content, novel: { title: "Novel" } }) },
  novel: { findUnique: async () => null },
  storyStateSnapshot: { findFirst: async () => null },
  auditReport: { findMany: async () => fixture.reports.map((report) => ({ ...report, issues: report.issues?.create ?? report.issues ?? [] })) },
  async $transaction(run) {
    fixture.transactions++;
    const before = structuredClone({ reports: fixture.reports, quality: fixture.quality });
    try {
      return await run({
        chapter: { updateMany: async ({ where }) => {
          assert.deepEqual(where, { id: "c", novelId: "n", content: "saved prose" });
          return { count: fixture.content === where.content ? 1 : 0 };
        } },
        auditReport: {
          deleteMany: async () => { fixture.deletes++; fixture.reports = []; },
          create: async ({ data }) => { fixture.reports.push(data); return data; },
        },
        qualityReport: { create: async ({ data }) => { fixture.quality.push(data); return data; } },
      });
    } catch (error) {
      fixture.reports = before.reports; fixture.quality = before.quality;
      throw error;
    }
  },
};
stub("db/prisma.js", { prisma: db });
stub("services/payoff/PayoffLedgerSyncService.js", { payoffLedgerSyncService: {
  syncLedger: async () => null,
  buildSyntheticAuditReports: () => [],
} });
stub("services/state/OpenConflictService.js", { openConflictService: { syncFromAuditReports: async () => { fixture.conflictSyncs++; } } });
stub("services/storyMode/storyModeProfile.js", { buildStoryModePromptBlock: () => "", normalizeStoryModeOutput: (x) => x });
stub("services/rag/index.js", { ragServices: { hybridRetrievalService: { buildContextBlock: async () => "" } } });
stub("services/audit/auditPromptContext.js", { resolveAuditChapterContextBlocks: async () => [] });
stub("prompting/core/promptRunner.js", { runStructuredPrompt: async ({ asset, promptInput }) => {
  fixture.assets.push(asset.id);
  await fixture.onModel?.();
  if (fixture.modelError) throw fixture.modelError;
  // Inject model JSON at the real prompt schema/post-validation boundary.
  const parsed = asset.outputSchema.parse(fixture.raw);
  return { output: asset.postValidate ? await asset.postValidate(parsed, promptInput) : parsed };
} });
const { AuditService } = require(path.join(dist, "services/audit/AuditService.js"));
const { repairSchema } = require(path.join(dist, "modules/novel/http/novelHttpSchemas.js"));
const { eligibleReviewIssues } = require(path.join(dist, "services/audit/manual/index.js"));
const service = new AuditService();
const manual = { manualEvidenceReview: true };
const score = { coherence: 81, repetition: 81, pacing: 81, voice: 81, engagement: 81, overall: 81 };
function finding(overrides = {}) {
  return { severity: "medium", category: "pacing", evidence: "A grounded reading concern", fixSuggestion: "Consider revising this passage",
    verdict: "confirmed", excerpt: "saved prose", startOffset: null, endOffset: null,
    readingImpact: "The passage affects the current scene", counterEvidence: "The intended pause may be deliberate; consider its scene function", ...overrides };
}
test.beforeEach(() => {
  fixture = { content: "saved prose", raw: { score, issues: [finding(), finding({ excerpt: "fabricated prose" })] },
    reports: [{ id: "prior", legacyScoreJson: "legacy" }], quality: [], transactions: 0, deletes: 0, assets: [], conflictSyncs: 0 };
});

test("manual provider failure and missing score remain failures without synthetic reports", async () => {
  fixture.modelError = new Error("provider unavailable");
  await assert.rejects(service.auditChapter("n", "c", "full", manual), /provider unavailable/);
  fixture.modelError = null; fixture.raw = { issues: [] };
  await assert.rejects(service.auditChapter("n", "c", "full", manual));
  assert.equal(fixture.transactions, 0);
  assert.equal(fixture.reports[0].id, "prior");
  assert.deepEqual(fixture.quality, []);
});

test("manual empty preview cannot replace saved reports", async () => {
  await assert.rejects(service.auditChapter("n", "c", "full", { ...manual, content: "" }), { statusCode: 400 });
  assert.equal(fixture.transactions, 0);
  assert.equal(fixture.assets.length, 0);
  assert.equal(fixture.reports[0].id, "prior");
});

test("different or stale caller prose is preview-only and marked for its outer caller", async () => {
  const result = await service.auditChapter("n", "c", "full", { ...manual, content: "older caller prose" });
  assert.equal(result.preview, true);
  assert.deepEqual(result.auditReports, []);
  assert.equal(fixture.transactions, 0);
  assert.deepEqual(fixture.quality, []);
  assert.equal(fixture.reports[0].id, "prior");
});

test("source change during model review rejects before deleting reports or storing quality", async () => {
  fixture.onModel = () => { fixture.content = "other writer prose"; };
  await assert.rejects(service.auditChapter("n", "c", "full", manual), { statusCode: 409 });
  assert.equal(fixture.deletes, 0);
  assert.equal(fixture.reports[0].id, "prior");
  assert.deepEqual(fixture.quality, []);
});

test("confirmed findings persist separately from advisory metadata in the same quality transaction", async () => {
  const result = await service.auditChapter("n", "c", "full", manual);
  assert.equal(result.preview, false);
  assert.equal(fixture.transactions, 1);
  assert.equal(fixture.quality.length, 1);
  assert.equal(fixture.reports.flatMap((r) => r.issues.create).length, 1);
  const stored = JSON.parse(fixture.reports[0].legacyScoreJson).manualReview;
  assert.equal(stored.issues.length, 2);
  assert.equal(stored.issues[1].calibration.repairEligible, false);
  assert.equal(stored.issues[1].calibration.verdict, "hypothesis");
  assert.equal(fixture.conflictSyncs, 0);
  assert.deepEqual(fixture.assets, ["audit.chapter.manual_evidence"]);
});

test("real HTTP repair schema preserves calibration for source checks after a chapter edit", async () => {
  const reviewed = await service.auditChapter("n", "c", "full", manual);
  const parsed = repairSchema.parse({ reviewIssues: reviewed.issues });
  assert.deepEqual(parsed.reviewIssues[0].calibration, reviewed.issues[0].calibration);
  assert.equal(eligibleReviewIssues(parsed.reviewIssues, "changed prose").length, 0);
  assert.equal(eligibleReviewIssues(parsed.reviewIssues, "saved prose").length, 1);
});

test("automatic audit retains its registered asset and original no-calibration contract", async () => {
  fixture.raw = { score, issues: [], auditReports: [] };
  await service.auditChapter("n", "c", "full", { skipPayoffLedgerSync: true });
  assert.deepEqual(fixture.assets, ["audit.chapter.full"]);
  assert.equal(fixture.quality.length, 0);
  assert.equal(fixture.conflictSyncs, 1);
});

// Keep the real public review orchestration, replacing only external workflow owners.
stub("modules/novel/quality/polishPersistence.js", { polishPrisma: db });
stub("services/planner/PlannerService.js", { plannerService: { buildReplanRecommendation: () => ({ recommended: false, blockingIssueIds: [] }) } });
stub("services/state/StateService.js", { stateService: {} });
stub("services/novel/runtime/GenerationContextAssembler.js", { GenerationContextAssembler: class {} });
stub("services/novel/runtime/ChapterRuntimeCoordinator.js", { ChapterRuntimeCoordinator: class {} });
stub("services/novel/director/runtime/DirectorAutomationLedgerEventService.js", { directorAutomationLedgerEventService: {} });
stub("services/novel/quality/ChapterQualityLoopService.js", { chapterQualityLoopService: {
  recordAssessment: async () => { fixture.assessments = (fixture.assessments ?? 0) + 1; return {}; },
} });
stub("services/novel/runtime/repair/chapterAuditContext.js", {
  assembleChapterAuditContextPackage: async () => {
    fixture.beforeAudit?.();
    return { chapter: { id: "c", order: 1 } };
  },
});
const { NovelCoreReviewService } = require(path.join(dist, "services/novel/novelCoreReviewService.js"));

test("public manual review rejects blank saved or preview prose before quality assessment", async () => {
  const publicReview = new NovelCoreReviewService();
  await assert.rejects(publicReview.reviewChapter("n", "c", { content: "" }), { statusCode: 400 });
  fixture.content = " \n ";
  await assert.rejects(publicReview.reviewChapter("n", "c"), { statusCode: 400 });
  assert.equal(fixture.transactions, 0);
  assert.equal(fixture.assessments ?? 0, 0);
  assert.equal(fixture.assets.length, 0);
  assert.equal(fixture.reports[0].id, "prior");
});

test("public review propagates the second-read preview marker and skips quality assessment", async () => {
  fixture.beforeAudit = () => { fixture.content = "changed after public review read"; };
  const result = await new NovelCoreReviewService().reviewChapter("n", "c");
  assert.equal(result.preview, true);
  assert.equal(result.replanRecommendation.recommended, false);
  assert.equal(fixture.transactions, 0);
  assert.equal(fixture.assessments ?? 0, 0);
  assert.deepEqual(fixture.quality, []);
  assert.equal(fixture.reports[0].id, "prior");
});
