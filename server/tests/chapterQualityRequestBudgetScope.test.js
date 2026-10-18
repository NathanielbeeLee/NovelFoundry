const test = require("node:test");
const assert = require("node:assert/strict");
const promptRunner = require("../dist/prompting/core/promptRunner.js");
const { runPipelineChapterWithRuntime } = require("../dist/services/novel/runtime/chapterRuntimePipeline.js");
const { ChapterQualityGateService } = require("../dist/services/novel/runtime/ChapterQualityGateService.js");
const { consumeLlmRequestBudget } = require("../dist/llm/requestBudget/index.js");

test("one chapter budget spans acceptance, repair and recheck while excluding writer and finalization work", async (t) => {
  const originalTextPrompt = promptRunner.runTextPrompt;
  t.after(() => { promptRunner.runTextPrompt = originalTextPrompt; });
  let reviews = 0;
  let repairCalls = 0;
  let sharedBudget;
  const scopes = [];
  const makeScore = (value) => ({ coherence: value, pacing: value, repetition: value, voice: value, engagement: value, overall: value });
  const gate = new ChapterQualityGateService({ acceptanceAssessmentService: {
    async assess() {
      for (let i = 0; i < 3; i += 1) consumeLlmRequestBudget();
      const score = makeScore(++reviews === 1 ? 70 : 90);
      return { score, scoreAvailability: "available", scoreReason: null, issues: [], auditReports: [], assessment: {
        status: "accepted", score, summary: "Fixture", blockingIssues: [], repairDirectives: [], missingObligations: [],
        repairability: "none", decisionReason: "Fixture", riskTags: [], continuePolicy: "continue",
        assetSyncRecommendation: { priority: "normal", reason: "Fixture", requiresFullPayoffReconcile: false },
      } };
    },
  } });
  promptRunner.runTextPrompt = async () => {
    repairCalls += 1;
    consumeLlmRequestBudget(); consumeLlmRequestBudget();
    return { output: "她走进屋内，把信放在桌上。" };
  };
  const contextPackage = {
    chapter: { id: "chapter-1", title: "Arrival", order: 1 },
    chapterRepairContext: null, bookContract: null, macroConstraints: null, volumeWindow: null, styleContext: null,
  };
  const result = await runPipelineChapterWithRuntime({
    validateRequest: (request) => request,
    async ensureNovelCharacters() {},
    async assemble() { return { novel: { id: "novel-1", title: "Fixture" },
      chapter: { id: "chapter-1", title: "Arrival", order: 1, content: null }, contextPackage }; },
    async generateDraftFromWriter() { consumeLlmRequestBudget(); return { content: "她走进屋内。" }; },
    async saveDraftAndArtifacts() { consumeLlmRequestBudget(); },
    async syncFinalChapterArtifacts() { consumeLlmRequestBudget(); assert.equal(sharedBudget.requestsUsed, 8); },
    async finalizeChapterContent({ content, request, qualityRequestBudget }) {
      consumeLlmRequestBudget();
      sharedBudget ??= qualityRequestBudget;
      scopes.push(qualityRequestBudget);
      const assessment = await gate.runAcceptanceGate({ novelId: "novel-1", chapterId: "chapter-1", contextPackage, content, request, qualityRequestBudget });
      consumeLlmRequestBudget();
      return { finalContent: content, runtimePackage: {
        novelId: "novel-1", chapterId: "chapter-1", context: contextPackage,
        audit: { score: assessment.score, scoreAvailability: assessment.scoreAvailability, scoreReason: null, reports: [], openIssues: [], hasBlockingIssues: false },
        meta: { acceptanceStatus: "accepted", continuePolicy: "continue", riskTags: [] },
      } };
    },
    async markChapterGenerationState() {}, async markChapterNeedsRepair() {},
  }, "novel-1", "chapter-1", { repairMode: "heavy_repair" });
  assert.equal(result.pass, true);
  assert.equal(reviews, 2);
  assert.equal(repairCalls, 1);
  assert.equal(scopes[0], scopes[1]);
  assert.equal(sharedBudget.requestsUsed, 8);
});
