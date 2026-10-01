const test = require("node:test");
const assert = require("node:assert/strict");
const promptRunner = require("../dist/prompting/core/promptRunner.js");

const {
  runPipelineChapterWithRuntime,
} = require("../dist/services/novel/runtime/chapterRuntimePipeline.js");
const {
  ChapterEmptyContentError,
} = require("../dist/services/novel/runtime/chapterEmptyContentError.js");
const {
  StructuredOutputError,
} = require("../dist/llm/structuredOutput.js");
const {
  wrapStructuredInvokeError,
} = require("../dist/llm/structuredInvokeParser.js");
const {
  ChapterAcceptanceAssessmentService,
} = require("../dist/services/novel/runtime/ChapterAcceptanceAssessmentService.js");
const {
  openConflictService,
} = require("../dist/services/state/OpenConflictService.js");
const {
  StreamOutcomeError,
} = require("../dist/llm/streamOutcome/index.js");

function createTextStreamLLM(content) {
  return {
    stream: async () => ({
      async *[Symbol.asyncIterator]() {
        yield { content };
      },
    }),
  };
}

function createRuntimePackage(overallScore, options = {}) {
  return {
    novelId: "novel-1",
    chapterId: "chapter-1",
    audit: {
      score: {
        coherence: overallScore,
        pacing: overallScore,
        repetition: overallScore,
        engagement: overallScore,
        voice: overallScore,
        overall: overallScore,
      },
      openIssues: [{
        auditType: "continuity",
        severity: "medium",
        evidence: "存在承接问题。",
        fixSuggestion: "补足承接。",
        code: "CONTINUITY_GAP",
      }],
      reports: [],
    },
    context: {
      chapterRepairContext: null,
      bookContract: null,
      macroConstraints: null,
      volumeWindow: null,
      styleContext: options.styleContext ?? null,
    },
  };
}

function createAcceptanceGateUnavailableRuntimePackage(overallScore) {
  return {
    ...createRuntimePackage(overallScore),
    audit: {
      score: {
        coherence: overallScore,
        pacing: overallScore,
        repetition: overallScore,
        engagement: overallScore,
        voice: overallScore,
        overall: overallScore,
      },
      openIssues: [{
        auditType: "continuity",
        severity: "medium",
        evidence: "章节接收闸门未返回可用结构化结果，系统保留复查风险。",
        fixSuggestion: "重新审校章节接收判断，不直接修改正文。",
        code: "acceptance_gate_unavailable",
      }],
      reports: [],
      hasBlockingIssues: false,
    },
    meta: {
      acceptanceStatus: "continue_with_risk",
      continuePolicy: "continue",
    },
  };
}

function createProseRiskRuntimePackage(overallScore, options = {}) {
  const base = createRuntimePackage(overallScore, options);
  const severity = options.severity ?? "high";
  const issue = {
    auditType: "mode_fit",
    severity,
    evidence: "第 1 行：他不是害怕，而是终于明白自己不能回头。",
    fixSuggestion: "改成具体动作和感官细节，删除模板化否定翻转。",
    code: options.code ?? "prose_negative_flip",
  };
  return {
    ...base,
    audit: {
      ...base.audit,
      openIssues: [issue],
      reports: [{
        auditType: "mode_fit",
        issues: [issue],
      }],
      hasBlockingIssues: severity === "high" || severity === "critical",
    },
    meta: {
      acceptanceStatus: "accepted",
      continuePolicy: "continue",
    },
    replanRecommendation: {
      recommended: severity === "high" || severity === "critical",
      action: severity === "high" || severity === "critical" ? "local_patch_plan" : "continue_with_warning",
      reason: "Prose quality issue should stay local to the chapter.",
      blockingIssueIds: severity === "high" || severity === "critical" ? ["prose-negative-flip"] : [],
      blockingLedgerKeys: [],
      affectedChapterOrders: [],
    },
    failureClassification: {
      code: "draft_repair_exhausted",
      summary: "正文自然度问题仍未修复。",
      decisionReason: "prose quality issue stays local",
      blockingObligations: [],
    },
  };
}

test("runPipelineChapterWithRuntime skips review and repair when autoReview is disabled", async () => {
  const stages = [];
  const generationStates = [];
  const savedDrafts = [];
  const finalSyncs = [];
  const timelineFinalizationCalls = [];
  let finalizeCalled = false;

  const result = await runPipelineChapterWithRuntime(
    {
      validateRequest(input) {
        return input;
      },
      async ensureNovelCharacters() {},
      async assemble() {
        return {
          novel: { id: "novel-1", title: "测试小说" },
          chapter: {
            id: "chapter-1",
            title: "第一章",
            order: 1,
            content: null,
            expectation: null,
          },
          contextPackage: {},
        };
      },
      async generateDraftFromWriter() {
        return { content: "生成后的正文" };
      },
      async saveDraftAndArtifacts(_novelId, _chapterId, content, generationState, options) {
        savedDrafts.push({ content, generationState, options });
      },
      async syncFinalChapterArtifacts(_novelId, _chapterId, content) {
        finalSyncs.push(content);
      },
      async finalizeChapterContent() {
        finalizeCalled = true;
        throw new Error("should not finalize");
      },
      async finalizeChapterTimeline(input) {
        timelineFinalizationCalls.push(input);
      },
        async markChapterGenerationState(_chapterId, generationState) {
          generationStates.push(generationState);
        },
        async markChapterNeedsRepair() {},
      },
    "novel-1",
    "chapter-1",
    {
      autoReview: false,
      autoRepair: true,
    },
    {
      async onStageChange(stage) {
        stages.push(stage);
      },
    },
  );

  assert.equal(finalizeCalled, false);
  assert.equal(timelineFinalizationCalls.length, 0);
  assert.deepEqual(stages, ["generating_chapters"]);
  assert.deepEqual(savedDrafts, [{
    content: "生成后的正文",
    generationState: "drafted",
    options: {
      scheduleBackgroundSync: false,
      artifactSyncMode: "adaptive",
      syncArtifacts: false,
    },
  }]);
  assert.equal(finalSyncs.length, 1);
  assert.deepEqual(generationStates, ["approved"]);
  assert.equal(result.reviewExecuted, false);
  assert.equal(result.pass, true);
  assert.equal(result.retryCountUsed, 0);
  assert.deepEqual(result.issues, []);
  assert.equal(result.runtimePackage, null);
  assert.deepEqual(result.score, {
    coherence: 100,
    pacing: 100,
    repetition: 100,
    engagement: 100,
    voice: 100,
    overall: 100,
  });
});

test("runPipelineChapterWithRuntime does not approve when timeline check fails", async () => {
  const generationStates = [];
  const finalizedContent = [];

  const result = await runPipelineChapterWithRuntime(
    {
      validateRequest(input) {
        return input;
      },
      async ensureNovelCharacters() {},
      async assemble() {
        return {
          novel: { id: "novel-1", title: "测试小说" },
          chapter: {
            id: "chapter-1",
            title: "第一章",
            order: 1,
            content: null,
            expectation: null,
          },
          contextPackage: {},
        };
      },
      async generateDraftFromWriter() {
        return { content: "生成后的正文" };
      },
      async saveDraftAndArtifacts() {},
      async syncFinalChapterArtifacts() {},
      async finalizeChapterContent(input) {
        finalizedContent.push(input.content);
        return {
          finalContent: input.content,
          runtimePackage: {
            audit: {
              score: {
                coherence: 98,
                pacing: 98,
                repetition: 98,
                engagement: 98,
                voice: 98,
                overall: 98,
              },
              openIssues: [],
              reports: [],
              hasBlockingIssues: false,
            },
            meta: {
              acceptanceStatus: "accepted",
              continuePolicy: "continue",
            },
            timelineCheck: {
              status: "failed",
            },
            context: {
              styleContext: null,
            },
          },
        };
      },
      async markChapterGenerationState(_chapterId, generationState) {
        generationStates.push(generationState);
      },
      async markChapterNeedsRepair() {},
    },
    "novel-1",
    "chapter-1",
    {
      autoReview: true,
      autoRepair: false,
    },
  );

  assert.deepEqual(finalizedContent, ["生成后的正文"]);
  assert.deepEqual(generationStates, ["reviewed"]);
  assert.equal(result.pass, false);
  assert.equal(result.runtimePackage.timelineCheck.status, "failed");
  assert.deepEqual(result.qualityDebtAttribution.firstFailureIssueCodes, []);
  assert.equal(result.qualityDebtAttribution.repairAttemptsUsed, 0);
  assert.equal(result.qualityDebtAttribution.repairAttemptsAllowed, 0);
});

test("runPipelineChapterWithRuntime passes confirmed provenance for approved final artifact sync", async () => {
  const finalSyncs = [];

  const result = await runPipelineChapterWithRuntime(
    {
      validateRequest(input) {
        return input;
      },
      async ensureNovelCharacters() {},
      async assemble() {
        return {
          novel: { id: "novel-1", title: "测试小说" },
          chapter: {
            id: "chapter-1",
            title: "第一章",
            order: 1,
            content: "已有正文",
            expectation: null,
          },
          contextPackage: {},
        };
      },
      async generateDraftFromWriter() {
        throw new Error("existing content should not be regenerated");
      },
      async saveDraftAndArtifacts() {},
      async syncFinalChapterArtifacts(_novelId, _chapterId, content, options) {
        finalSyncs.push({ content, options });
      },
      async finalizeChapterContent({ content }) {
        return {
          finalContent: content,
          runtimePackage: createRuntimePackage(90),
        };
      },
      async markChapterGenerationState() {},
      async markChapterNeedsRepair() {},
    },
    "novel-1",
    "chapter-1",
    {
      autoReview: true,
      autoRepair: true,
    },
  );

  assert.equal(result.pass, true);
  assert.deepEqual(finalSyncs, [{
    content: "已有正文",
    options: {
      artifactSyncMode: "adaptive",
      contentProvenance: "confirmed",
    },
  }]);
});

test("runPipelineChapterWithRuntime applies a batch polish instruction even when the chapter already passes", async () => {
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  const patchIssues = [];
  const savedDrafts = [];
  const finalSyncs = [];
  let reviewCount = 0;

  promptRunner.runStructuredPrompt = async (request) => {
    patchIssues.push(request.promptInput.issuesJson);
    return {
      output: {
        strategy: "patch_first",
        summary: "按本次批量要求统一叙述视角。",
        patches: [{
          id: "patch-batch-polish",
          targetExcerpt: "他望着窗外，心里想起很久以前的雨。",
          replacement: "我望着窗外，想起很久以前的那场雨。",
          reason: "统一为第一人称并减少解释式表达。",
          issueIds: [],
        }],
        requiresFullRewrite: false,
        escalationReason: null,
      },
    };
  };

  try {
    const result = await runPipelineChapterWithRuntime(
      {
        validateRequest(input) {
          return input;
        },
        async ensureNovelCharacters() {},
        async assemble() {
          return {
            novel: { id: "novel-1", title: "测试小说" },
            chapter: {
              id: "chapter-1",
              title: "第一章",
              order: 1,
              content: "他望着窗外，心里想起很久以前的雨。",
              expectation: null,
            },
            contextPackage: {},
          };
        },
        async generateDraftFromWriter() {
          throw new Error("existing content should not be regenerated");
        },
        async saveDraftAndArtifacts(_novelId, _chapterId, content, generationState) {
          savedDrafts.push({ content, generationState });
        },
        async syncFinalChapterArtifacts(_novelId, _chapterId, content, options) {
          finalSyncs.push({ content, options });
        },
        async finalizeChapterContent({ content }) {
          reviewCount += 1;
          return {
            finalContent: content,
            runtimePackage: createRuntimePackage(90),
          };
        },
        async markChapterGenerationState() {},
        async markChapterNeedsRepair() {},
      },
      "novel-1",
      "chapter-1",
      {
        autoReview: true,
        autoRepair: true,
        batchPolishInstruction: "统一第一人称，并减少说教式总结。",
      },
    );

    assert.equal(reviewCount, 2);
    assert.equal(result.pass, true);
    assert.equal(result.retryCountUsed, 1);
    assert.match(patchIssues[0], /统一第一人称/);
    assert.deepEqual(savedDrafts, [{
      content: "我望着窗外，想起很久以前的那场雨。",
      generationState: "repaired",
    }]);
    assert.equal(finalSyncs[0].content, "我望着窗外，想起很久以前的那场雨。");
    assert.equal(finalSyncs[0].options.contentProvenance, "confirmed");
  } finally {
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
  }
});

test("runPipelineChapterWithRuntime passes debt provenance for retained failed content", async () => {
  const finalSyncs = [];

  const result = await runPipelineChapterWithRuntime(
    {
      validateRequest(input) {
        return input;
      },
      async ensureNovelCharacters() {},
      async assemble() {
        return {
          novel: { id: "novel-1", title: "测试小说" },
          chapter: {
            id: "chapter-1",
            title: "第一章",
            order: 1,
            content: null,
            expectation: null,
          },
          contextPackage: {},
        };
      },
      async generateDraftFromWriter() {
        return { content: "生成后的正文" };
      },
      async saveDraftAndArtifacts() {},
      async syncFinalChapterArtifacts(_novelId, _chapterId, content, options) {
        finalSyncs.push({ content, options });
      },
      async finalizeChapterContent({ content }) {
        return {
          finalContent: `${content}，保留但待复核。`,
          runtimePackage: createRuntimePackage(70),
        };
      },
      async markChapterGenerationState() {},
      async markChapterNeedsRepair() {},
    },
    "novel-1",
    "chapter-1",
    {
      autoReview: true,
      autoRepair: false,
    },
  );

  assert.equal(result.pass, false);
  assert.deepEqual(finalSyncs, [{
    content: "生成后的正文，保留但待复核。",
    options: {
      artifactSyncMode: "adaptive",
      contentProvenance: "debt",
    },
  }]);
  assert.equal(result.qualityDebtAttribution.repairAttemptsUsed, 0);
  assert.equal(result.qualityDebtAttribution.repairAttemptsAllowed, 0);
});

test("runPipelineChapterWithRuntime keeps the draft when a light patch cannot be applied", async () => {
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  const stages = [];
  const savedDrafts = [];
  const finalSyncs = [];
  let needsRepairMarked = false;
  let reviewCount = 0;
  let patchPlanCalls = 0;
  let heavyRewriteCalls = 0;

  promptRunner.runStructuredPrompt = async () => {
    patchPlanCalls += 1;
    return {
      output: {
        strategy: "patch_first",
        summary: "补足承接。",
        patches: [{
          id: "patch-missing",
          targetExcerpt: "模型认为存在但正文里没有的片段。",
          replacement: "替换后的片段。",
          reason: "目标片段不存在。",
          issueIds: [],
        }],
        requiresFullRewrite: false,
        escalationReason: null,
      },
    };
  };
  promptRunner.setPromptRunnerLLMFactoryForTests(async () => ({
    stream: async () => {
      heavyRewriteCalls += 1;
      throw new Error("light repair must not escalate to a full rewrite");
    },
  }));

  try {
    const result = await runPipelineChapterWithRuntime(
      {
        validateRequest(input) {
          return input;
        },
        async ensureNovelCharacters() {},
        async assemble() {
          return {
            novel: { id: "novel-1", title: "测试小说" },
            chapter: {
              id: "chapter-1",
              title: "第一章",
              order: 1,
              content: null,
              expectation: null,
            },
            contextPackage: {},
          };
        },
        async generateDraftFromWriter() {
          return { content: "生成后的正文需要承接。" };
        },
        async saveDraftAndArtifacts(_novelId, _chapterId, content, generationState, options) {
          savedDrafts.push({ content, generationState, options });
        },
        async syncFinalChapterArtifacts(_novelId, _chapterId, content) {
          finalSyncs.push(content);
        },
        async finalizeChapterContent({ content }) {
          reviewCount += 1;
          return {
            finalContent: content,
            runtimePackage: createRuntimePackage(reviewCount === 1 ? 72 : 90),
          };
        },
        async markChapterGenerationState() {},
        async markChapterNeedsRepair() {
          needsRepairMarked = true;
        },
      },
      "novel-1",
      "chapter-1",
      {
        autoReview: true,
        autoRepair: true,
      },
      {
        async onStageChange(stage) {
          stages.push(stage);
        },
      },
    );

    assert.deepEqual(stages, ["generating_chapters", "reviewing", "repairing"]);
    assert.equal(reviewCount, 1);
    assert.equal(result.pass, false);
    assert.equal(result.retryCountUsed, 1);
    assert.equal(result.qualityDebtAttribution.repairAttemptsUsed, 1);
    assert.equal(result.qualityDebtAttribution.repairAttemptsAllowed, 1);
    assert.match(result.recoverableRepairFailure.message, /目标片段不存在/);
    assert.equal(needsRepairMarked, true);
    assert.equal(finalSyncs.length, 1);
    assert.equal(patchPlanCalls, 1);
    assert.equal(heavyRewriteCalls, 0);
    assert.deepEqual(savedDrafts, [{
      content: "生成后的正文需要承接。",
      generationState: "drafted",
      options: {
        scheduleBackgroundSync: false,
        artifactSyncMode: "adaptive",
        syncArtifacts: false,
      },
    }]);
  } finally {
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
    promptRunner.setPromptRunnerLLMFactoryForTests();
  }
});

test("runPipelineChapterWithRuntime sends critical prose findings to repair and retains exhausted prose debt", async () => {
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  const stages = [];
  const savedDrafts = [];
  const finalSyncs = [];
  const finalizationCalls = [];
  const patchIssues = [];
  let reviewCount = 0;

  promptRunner.runStructuredPrompt = async (request) => {
    patchIssues.push(request.promptInput.issuesJson);
    return {
      output: {
        strategy: "patch_first",
        summary: "去掉模板化否定翻转。",
        patches: [{
          id: "patch-prose-negative-flip",
          targetExcerpt: "他不是害怕，而是终于明白自己不能回头。",
          replacement: "他握紧刀柄，指节发白，仍一步踏进雨里。",
          reason: "把抽象解释改成动作。",
          issueIds: [],
        }],
        requiresFullRewrite: false,
        escalationReason: null,
      },
    };
  };

  try {
    const result = await runPipelineChapterWithRuntime(
      {
        validateRequest(input) {
          return input;
        },
        async ensureNovelCharacters() {},
        async assemble() {
          return {
            novel: { id: "novel-1", title: "测试小说" },
            chapter: {
              id: "chapter-1",
              title: "第一章",
              order: 1,
              content: null,
              expectation: null,
            },
            contextPackage: {},
          };
        },
        async generateDraftFromWriter() {
          return { content: "他不是害怕，而是终于明白自己不能回头。" };
        },
        async saveDraftAndArtifacts(_novelId, _chapterId, content, generationState, options) {
          savedDrafts.push({ content, generationState, options });
        },
        async syncFinalChapterArtifacts(_novelId, _chapterId, content, options) {
          finalSyncs.push({ content, options });
        },
        async finalizeChapterContent({ content }) {
          reviewCount += 1;
          return {
            finalContent: content,
            runtimePackage: createProseRiskRuntimePackage(92),
          };
        },
        async finalizeChapterTimeline(input) {
          finalizationCalls.push(input);
        },
        async markChapterGenerationState() {},
        async markChapterNeedsRepair() {},
      },
      "novel-1",
      "chapter-1",
      {
        autoReview: true,
        autoRepair: true,
      },
      {
        async onStageChange(stage) {
          stages.push(stage);
        },
      },
    );

    assert.deepEqual(stages, ["generating_chapters", "reviewing", "repairing", "reviewing"]);
    assert.equal(reviewCount, 2);
    assert.equal(result.retryCountUsed, 1);
    assert.equal(result.pass, false);
    assert.equal(result.runtimePackage.audit.openIssues[0].code, "prose_negative_flip");
    assert.match(patchIssues[0], /第 1 行/);
    assert.match(patchIssues[0], /模板化否定翻转/);
    assert.deepEqual(savedDrafts.map((item) => item.generationState), ["drafted", "repaired"]);
    assert.equal(finalSyncs[0].options.contentProvenance, "debt");
    assert.equal(finalizationCalls.length, 0);
    assert.deepEqual(result.qualityDebtAttribution.firstFailureIssueCodes, ["prose_negative_flip"]);
    assert.deepEqual(result.qualityDebtAttribution.secondFailureIssueCodes, ["prose_negative_flip"]);
  } finally {
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
  }
});

test("runPipelineChapterWithRuntime does not rewrite the chapter when a patch target is unsafe", async () => {
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  const savedDrafts = [];
  let reviewCount = 0;
  let heavyRewriteCalls = 0;

  promptRunner.runStructuredPrompt = async () => ({
    output: {
      strategy: "patch_first",
      summary: "尝试局部修文。",
      patches: [{
        id: "patch-short-target",
        targetExcerpt: "短",
        replacement: "替换后的安全句段。",
        reason: "模型给出了过短定位片段。",
        issueIds: [],
      }],
      requiresFullRewrite: false,
      escalationReason: null,
    },
  });
  promptRunner.setPromptRunnerLLMFactoryForTests(async () => ({
    stream: async () => {
      heavyRewriteCalls += 1;
      throw new Error("unsafe patch must remain recoverable");
    },
  }));

  try {
    const result = await runPipelineChapterWithRuntime(
      {
        validateRequest(input) {
          return input;
        },
        async ensureNovelCharacters() {},
        async assemble() {
          return {
            novel: { id: "novel-1", title: "测试小说" },
            chapter: {
              id: "chapter-1",
              title: "第一章",
              order: 1,
              content: null,
              expectation: null,
            },
            contextPackage: {},
          };
        },
        async generateDraftFromWriter() {
          return { content: "生成后的正文需要承接。" };
        },
        async saveDraftAndArtifacts(_novelId, _chapterId, content, generationState) {
          savedDrafts.push({ content, generationState });
        },
        async syncFinalChapterArtifacts() {},
        async finalizeChapterContent({ content }) {
          reviewCount += 1;
          return {
            finalContent: content,
            runtimePackage: createRuntimePackage(reviewCount === 1 ? 72 : 90),
          };
        },
        async markChapterGenerationState() {},
        async markChapterNeedsRepair() {},
      },
      "novel-1",
      "chapter-1",
      {
        autoReview: true,
        autoRepair: true,
      },
    );

    assert.equal(reviewCount, 1);
    assert.equal(result.pass, false);
    assert.equal(result.retryCountUsed, 1);
    assert.equal(result.qualityDebtAttribution.repairAttemptsUsed, 1);
    assert.equal(result.qualityDebtAttribution.repairAttemptsAllowed, 1);
    assert.match(result.recoverableRepairFailure.message, /局部补丁计划不可安全应用/);
    assert.equal(heavyRewriteCalls, 0);
    assert.deepEqual(savedDrafts, [{
      content: "生成后的正文需要承接。",
      generationState: "drafted",
    }]);
  } finally {
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
    promptRunner.setPromptRunnerLLMFactoryForTests();
  }
});

test("runPipelineChapterWithRuntime defers acceptance gate unavailable risk without local patch prompt", async () => {
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  const stages = [];
  const savedDrafts = [];
  const needsRepairMarked = [];
  let reviewCount = 0;

  promptRunner.runStructuredPrompt = async () => {
    throw new Error("patch repair should not run for acceptance gate unavailable risk");
  };
  promptRunner.setPromptRunnerLLMFactoryForTests(async () => ({
    stream: async () => {
      throw new Error("heavy repair should not run for acceptance gate unavailable risk");
    },
  }));

  try {
    const result = await runPipelineChapterWithRuntime(
      {
        validateRequest(input) {
          return input;
        },
        async ensureNovelCharacters() {},
        async assemble() {
          return {
            novel: { id: "novel-1", title: "测试小说" },
            chapter: {
              id: "chapter-1",
              title: "第一章",
              order: 1,
              content: null,
              expectation: null,
            },
            contextPackage: {},
          };
        },
        async generateDraftFromWriter() {
          return { content: "生成后的正文可保留。" };
        },
        async saveDraftAndArtifacts(_novelId, _chapterId, content, generationState) {
          savedDrafts.push({ content, generationState });
        },
        async syncFinalChapterArtifacts() {},
        async finalizeChapterContent({ content }) {
          reviewCount += 1;
          return {
            finalContent: content,
            runtimePackage: createAcceptanceGateUnavailableRuntimePackage(72),
          };
        },
        async markChapterGenerationState() {},
        async markChapterNeedsRepair(chapterId) {
          needsRepairMarked.push(chapterId);
        },
      },
      "novel-1",
      "chapter-1",
      {
        autoReview: true,
        autoRepair: true,
      },
      {
        async onStageChange(stage) {
          stages.push(stage);
        },
      },
    );

    assert.deepEqual(stages, ["generating_chapters", "reviewing", "repairing"]);
    assert.equal(reviewCount, 1);
    assert.equal(result.pass, false);
    assert.equal(result.retryCountUsed, 1);
    assert.equal(result.qualityDebtAttribution.repairAttemptsUsed, 1);
    assert.equal(result.qualityDebtAttribution.repairAttemptsAllowed, 1);
    assert.equal(result.recoverableRepairFailure.message, "章节接收判断暂时不可用，正文已保留，后续需要重新审校或人工复查。");
    assert.deepEqual(result.recoverableRepairFailure.failureTypes, ["review_gate_unavailable"]);
    assert.deepEqual(needsRepairMarked, ["chapter-1"]);
    assert.deepEqual(savedDrafts, [{
      content: "生成后的正文可保留。",
      generationState: "drafted",
    }]);
  } finally {
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
    promptRunner.setPromptRunnerLLMFactoryForTests();
  }
});

test("runPipelineChapterWithRuntime uses the selected light repair for style source leakage", async () => {
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  const stages = [];
  const savedDrafts = [];
  let patchRepairCalled = false;
  let heavyRewriteCalls = 0;
  let reviewCount = 0;

  promptRunner.runStructuredPrompt = async () => {
    patchRepairCalled = true;
    return {
      output: {
        strategy: "patch_first",
        summary: "移除来源作品实体。",
        patches: [{
          id: "patch-style-source",
          targetExcerpt: "北凉王世子踏进城门，所有人都屏住呼吸。",
          replacement: "年轻世子踏进城门，所有人都屏住呼吸。",
          reason: "保留场景节奏，移除来源实体。",
          issueIds: [],
        }],
        requiresFullRewrite: false,
        escalationReason: null,
      },
    };
  };
  promptRunner.setPromptRunnerLLMFactoryForTests(async () => ({
    stream: async () => {
      heavyRewriteCalls += 1;
      throw new Error("light repair must not invoke full rewrite");
    },
  }));

  try {
    const styleContext = {
      sanitizedGenerationProfile: {
        writingGuidance: ["keep fast scene turns without copying source entities"],
        forbiddenEntities: ["北凉王世子"],
        sourceProfileNames: ["source style"],
        sanitizedAt: "2026-05-01T00:00:00.000Z",
        strategy: "deterministic",
      },
    };

    const result = await runPipelineChapterWithRuntime(
      {
        validateRequest(input) {
          return input;
        },
        async ensureNovelCharacters() {},
        async assemble() {
          return {
            novel: { id: "novel-1", title: "test novel" },
            chapter: {
              id: "chapter-1",
              title: "chapter one",
              order: 1,
              content: null,
              expectation: null,
            },
            contextPackage: { styleContext },
          };
        },
        async generateDraftFromWriter() {
          return { content: "北凉王世子踏进城门，所有人都屏住呼吸。" };
        },
        async saveDraftAndArtifacts(_novelId, _chapterId, content, generationState) {
          savedDrafts.push({ content, generationState });
        },
        async syncFinalChapterArtifacts() {},
        async finalizeChapterContent({ content }) {
          reviewCount += 1;
          return {
            finalContent: content,
            runtimePackage: createRuntimePackage(92, { styleContext }),
          };
        },
        async markChapterGenerationState() {},
        async markChapterNeedsRepair() {},
      },
      "novel-1",
      "chapter-1",
      {
        autoReview: true,
        autoRepair: true,
      },
      {
        async onStageChange(stage) {
          stages.push(stage);
        },
      },
    );

    assert.equal(patchRepairCalled, true);
    assert.equal(heavyRewriteCalls, 0);
    assert.deepEqual(stages, ["generating_chapters", "reviewing", "repairing", "reviewing"]);
    assert.equal(reviewCount, 2);
    assert.equal(result.pass, true);
    assert.equal(result.retryCountUsed, 1);
    assert.deepEqual(savedDrafts, [{
      content: "北凉王世子踏进城门，所有人都屏住呼吸。",
      generationState: "drafted",
    }, {
      content: "年轻世子踏进城门，所有人都屏住呼吸。",
      generationState: "repaired",
    }]);
  } finally {
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
    promptRunner.setPromptRunnerLLMFactoryForTests();
  }
});

test("runPipelineChapterWithRuntime does not save a generated draft twice when writer already synced artifacts", async () => {
  const savedDrafts = [];
  const finalSyncs = [];

  const result = await runPipelineChapterWithRuntime(
    {
      validateRequest(input) {
        return input;
      },
      async ensureNovelCharacters() {},
      async assemble() {
        return {
          novel: { id: "novel-1", title: "test novel" },
          chapter: {
            id: "chapter-1",
            title: "chapter one",
            order: 1,
            content: null,
            expectation: null,
          },
          contextPackage: {},
        };
      },
      async generateDraftFromWriter() {
        return { content: "generated draft", artifactsAlreadySynced: true };
      },
      async saveDraftAndArtifacts(_novelId, _chapterId, content, generationState) {
        savedDrafts.push({ content, generationState });
      },
      async syncFinalChapterArtifacts(_novelId, _chapterId, content) {
        finalSyncs.push(content);
      },
      async finalizeChapterContent({ content }) {
        return {
          finalContent: content,
          runtimePackage: createRuntimePackage(90),
        };
      },
      async markChapterGenerationState() {},
      async markChapterNeedsRepair() {},
    },
    "novel-1",
    "chapter-1",
    {
      autoReview: true,
      autoRepair: true,
    },
  );

  assert.deepEqual(savedDrafts, []);
  assert.deepEqual(finalSyncs, ["generated draft"]);
  assert.equal(result.pass, true);
  assert.equal(result.reviewExecuted, true);
});

test("runPipelineChapterWithRuntime does not resave unchanged existing chapter content as a draft", async () => {
  const stages = [];
  const savedDrafts = [];
  const finalSyncs = [];
  const generationStates = [];

  const result = await runPipelineChapterWithRuntime(
    {
      validateRequest(input) {
        return input;
      },
      async ensureNovelCharacters() {},
      async assemble() {
        return {
          novel: { id: "novel-1", title: "test novel" },
          chapter: {
            id: "chapter-1",
            title: "chapter one",
            order: 1,
            content: "existing reviewed content",
            expectation: null,
          },
          contextPackage: {},
        };
      },
      async generateDraftFromWriter() {
        throw new Error("existing content should not be regenerated");
      },
      async saveDraftAndArtifacts(_novelId, _chapterId, content, generationState) {
        savedDrafts.push({ content, generationState });
      },
      async syncFinalChapterArtifacts(_novelId, _chapterId, content) {
        finalSyncs.push(content);
      },
      async finalizeChapterContent({ content }) {
        return {
          finalContent: content,
          runtimePackage: createRuntimePackage(90),
        };
      },
      async markChapterGenerationState(_chapterId, generationState) {
        generationStates.push(generationState);
      },
      async markChapterNeedsRepair() {},
    },
    "novel-1",
    "chapter-1",
    {
      autoReview: true,
      autoRepair: true,
    },
    {
      async onStageChange(stage) {
        stages.push(stage);
      },
    },
  );

  assert.deepEqual(stages, ["reviewing"]);
  assert.deepEqual(savedDrafts, []);
  assert.deepEqual(finalSyncs, ["existing reviewed content"]);
  assert.deepEqual(generationStates, ["reviewed", "approved"]);
  assert.equal(result.pass, true);
});

test("runPipelineChapterWithRuntime leaves empty writer retries to the outer execution budget", async () => {
  const stages = [];
  const emptyEvents = [];
  const savedDrafts = [];
  let generationCount = 0;

  await assert.rejects(
    () => runPipelineChapterWithRuntime(
      {
        validateRequest(input) {
          return input;
        },
        async ensureNovelCharacters() {},
        async assemble() {
          return {
            novel: { id: "novel-1", title: "测试小说" },
            chapter: {
              id: "chapter-1",
              title: "第一章",
              order: 1,
              content: null,
              expectation: null,
            },
            contextPackage: {},
          };
        },
        async generateDraftFromWriter() {
          generationCount += 1;
          return { content: "   " };
        },
        async saveDraftAndArtifacts(_novelId, _chapterId, content, generationState) {
          savedDrafts.push({ content, generationState });
        },
        async syncFinalChapterArtifacts() {},
        async finalizeChapterContent() {
          throw new Error("empty drafts should not be reviewed");
        },
        async markChapterGenerationState() {},
        async markChapterNeedsRepair() {},
      },
      "novel-1",
      "chapter-1",
      {
        autoReview: true,
        autoRepair: true,
      },
      {
        async onStageChange(stage) {
          stages.push(stage);
        },
        async onEmptyContent(event) {
          emptyEvents.push({
            attempt: event.attempt,
            willRetry: event.willRetry,
            contentLength: event.contentLength,
          });
        },
      },
    ),
    ChapterEmptyContentError,
  );

  assert.equal(generationCount, 1);
  assert.deepEqual(stages, ["generating_chapters"]);
  assert.deepEqual(emptyEvents, [{ attempt: 1, willRetry: false, contentLength: 0 }]);
  assert.deepEqual(savedDrafts, []);
});

test("runPipelineChapterWithRuntime defaults to a single repair pass before stopping", async () => {
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  const stages = [];
  const finalizeInputs = [];
  const savedDrafts = [];
  const finalSyncs = [];
  const generationStates = [];
  const finalizationCalls = [];
  const consumedRetries = [];
  let reviewCount = 0;

  promptRunner.runStructuredPrompt = async () => ({
    output: {
      strategy: "patch_first",
      summary: "补足承接。",
      patches: [{
        id: "patch-1",
        targetExcerpt: "初审正文需要承接。",
        replacement: "修后正文补足承接。",
        reason: "补足承接。",
        issueIds: [],
      }],
      requiresFullRewrite: false,
      escalationReason: null,
    },
  });

  try {
    const result = await runPipelineChapterWithRuntime(
      {
        validateRequest(input) {
          return input;
        },
        async ensureNovelCharacters() {},
        async assemble() {
          return {
            novel: { id: "novel-1", title: "测试小说" },
            chapter: {
              id: "chapter-1",
              title: "第一章",
              order: 1,
              content: null,
              expectation: null,
            },
            contextPackage: {},
          };
        },
        async generateDraftFromWriter() {
          return { content: "生成后的正文" };
        },
        async saveDraftAndArtifacts(_novelId, _chapterId, content, generationState) {
          savedDrafts.push({ content, generationState });
        },
        async syncFinalChapterArtifacts(_novelId, _chapterId, content) {
          finalSyncs.push(content);
        },
        async finalizeChapterContent({ content }) {
          reviewCount += 1;
          finalizeInputs.push(content);
          return {
            finalContent: reviewCount === 1 ? "初审正文需要承接。" : "修后复审正文",
            runtimePackage: createRuntimePackage(reviewCount === 1 ? 72 : 73),
          };
        },
        async finalizeChapterTimeline(input) {
          finalizationCalls.push(input);
        },
        async markChapterGenerationState(_chapterId, generationState) {
          generationStates.push(generationState);
        },
        async markChapterNeedsRepair() {},
      },
      "novel-1",
      "chapter-1",
      {
        autoReview: true,
        autoRepair: true,
      },
      {
        async onStageChange(stage) {
          stages.push(stage);
        },
        async onRetryConsumed(kind) {
          consumedRetries.push(kind);
        },
      },
    );

    assert.deepEqual(stages, ["generating_chapters", "reviewing", "repairing", "reviewing"]);
    assert.deepEqual(finalizeInputs, ["生成后的正文", "修后正文补足承接。"]);
    assert.equal(reviewCount, 2);
    assert.equal(result.retryCountUsed, 1);
    assert.deepEqual(consumedRetries, ["quality_repair"]);
    assert.equal(result.pass, false);
    assert.deepEqual(generationStates, ["reviewed", "reviewed"]);
    assert.deepEqual(savedDrafts, [
      {
        content: "生成后的正文",
        generationState: "drafted",
      },
      {
        content: "修后正文补足承接。",
        generationState: "repaired",
      },
    ]);
    assert.equal(finalSyncs.length, 1);
    assert.equal(finalizationCalls.length, 0);
  } finally {
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
  }
});

test("runPipelineChapterWithRuntime clamps maxRetries to a single repair pass", async () => {
  const originalRunStructuredPrompt = promptRunner.runStructuredPrompt;
  const stages = [];
  const finalizeInputs = [];
  const savedDrafts = [];
  const finalSyncs = [];
  const generationStates = [];
  let reviewCount = 0;

  promptRunner.runStructuredPrompt = async () => ({
    output: {
      strategy: "patch_first",
      summary: "补足承接。",
      patches: [{
        id: "patch-1",
        targetExcerpt: "初审正文需要承接。",
        replacement: "修后正文补足承接。",
        reason: "补足承接。",
        issueIds: [],
      }],
      requiresFullRewrite: false,
      escalationReason: null,
    },
  });

  try {
    const result = await runPipelineChapterWithRuntime(
      {
        validateRequest(input) {
          return input;
        },
        async ensureNovelCharacters() {},
        async assemble() {
          return {
            novel: { id: "novel-1", title: "测试小说" },
            chapter: {
              id: "chapter-1",
              title: "第一章",
              order: 1,
              content: null,
              expectation: null,
            },
            contextPackage: {},
          };
        },
        async generateDraftFromWriter() {
          return { content: "生成后的正文" };
        },
        async saveDraftAndArtifacts(_novelId, _chapterId, content, generationState, options) {
          savedDrafts.push({ content, generationState, options });
        },
        async syncFinalChapterArtifacts(_novelId, _chapterId, content) {
          finalSyncs.push(content);
        },
        async finalizeChapterContent({ content }) {
          reviewCount += 1;
          finalizeInputs.push(content);
          return {
            finalContent: reviewCount === 1 ? "初审正文需要承接。" : "修后复审正文",
            runtimePackage: createRuntimePackage(reviewCount === 1 ? 72 : 73),
          };
        },
        async markChapterGenerationState(_chapterId, generationState) {
          generationStates.push(generationState);
        },
        async markChapterNeedsRepair() {},
      },
      "novel-1",
      "chapter-1",
      {
        maxRetries: 5,
        autoReview: true,
        autoRepair: true,
      },
      {
        async onStageChange(stage) {
          stages.push(stage);
        },
      },
    );

    assert.deepEqual(stages, ["generating_chapters", "reviewing", "repairing", "reviewing"]);
    assert.deepEqual(finalizeInputs, ["生成后的正文", "修后正文补足承接。"]);
    assert.equal(reviewCount, 2);
    assert.equal(result.retryCountUsed, 1);
    assert.equal(result.pass, false);
    assert.deepEqual(generationStates, ["reviewed", "reviewed"]);
    assert.deepEqual(savedDrafts, [
      {
        content: "生成后的正文",
        generationState: "drafted",
        options: {
          scheduleBackgroundSync: false,
          artifactSyncMode: "adaptive",
          syncArtifacts: false,
        },
      },
      {
        content: "修后正文补足承接。",
        generationState: "repaired",
        options: {
          scheduleBackgroundSync: false,
          artifactSyncMode: "adaptive",
          syncArtifacts: false,
        },
      },
    ]);
    assert.equal(finalSyncs.length, 1);
  } finally {
    promptRunner.runStructuredPrompt = originalRunStructuredPrompt;
  }
});

function createStructuredOutputFailure(category) {
  return new StructuredOutputError({
    message: `Isolated chapter invocation failure: ${category}`,
    category,
    diagnostics: {
      strategy: "prompt_json",
      profile: {
        nativeJsonSchema: false,
        nativeJsonObject: false,
        requiresNonThinkingForStructured: false,
        supportsReasoningToggle: false,
        omitMaxTokensForNativeStructured: false,
        preferredStructuredStrategy: "prompt_json",
        family: "fixture",
      },
      reasoningForcedOff: false,
      fallbackAvailable: false,
      fallbackUsed: false,
      errorCategory: category,
    },
  });
}

function createWrappedCancellation() {
  const cancellation = Object.assign(new Error("Operation cancelled"), { name: "AbortError" });
  const wrapper = new Error("Provider invocation interrupted", { cause: cancellation });
  return wrapStructuredInvokeError({
    label: "chapter-repair-fixture",
    error: wrapper,
    strategy: "prompt_json",
    profile: createStructuredOutputFailure("transport_error").diagnostics.profile,
  });
}

function createRepairFailureFixture() {
  const trace = { drafts: [], syncs: [], states: [], retries: [], reviews: 0, needsRepair: 0 };
  const content = "守门人把湿透的信放到桌上，等她拆开封口后才离开。";
  const deps = {
    validateRequest: (input) => input,
    async ensureNovelCharacters() {},
    async assemble() {
      return {
        novel: { id: "novel-1", title: "Fixture novel" },
        chapter: { id: "chapter-1", title: "Arrival", order: 1, content: null, expectation: null },
        contextPackage: {},
      };
    },
    async generateDraftFromWriter() { return { content }; },
    async saveDraftAndArtifacts(_novelId, _chapterId, draft, state) {
      trace.drafts.push({ content: draft, state });
    },
    async finalizeChapterContent({ content: draft }) {
      trace.reviews += 1;
      return { finalContent: draft, runtimePackage: createRuntimePackage(70) };
    },
    async syncFinalChapterArtifacts(_novelId, _chapterId, draft, options) {
      trace.syncs.push({ content: draft, ...options });
    },
    async markChapterGenerationState(_chapterId, state) { trace.states.push(state); },
    async markChapterNeedsRepair() { trace.needsRepair += 1; },
  };
  return {
    content, deps, trace,
    hooks: { async onRetryConsumed(kind) { trace.retries.push(kind); } },
  };
}

test("local patch output and transport failures retain prose, finalize debt, and consume only one repair", async (t) => {
  const original = promptRunner.runStructuredPrompt;
  try {
    for (const category of [
      "schema_mismatch", "malformed_json", "incomplete_json", "thinking_pollution",
      "transport_error", "usage_budget_exceeded",
    ]) {
      await t.test(category, async () => {
        promptRunner.runStructuredPrompt = async () => { throw createStructuredOutputFailure(category); };
        const fixture = createRepairFailureFixture();
        const result = await runPipelineChapterWithRuntime(
          fixture.deps, "novel-1", "chapter-1", { repairMode: "light_repair" }, fixture.hooks,
        );
        assert.equal(result.pass, false);
        assert.deepEqual(result.recoverableRepairFailure.failureTypes, ["patch_plan_invalid"]);
        assert.equal(result.qualityDebtAttribution.repairAttemptsUsed, 1);
        assert.equal(result.retryCountUsed, 1);
        assert.deepEqual(fixture.trace.retries, ["quality_repair"]);
        assert.deepEqual(fixture.trace.drafts, [{ content: fixture.content, state: "drafted" }]);
        assert.deepEqual(fixture.trace.syncs, [{
          content: fixture.content, artifactSyncMode: "adaptive", contentProvenance: "debt",
        }]);
        assert.deepEqual(fixture.trace.states, ["reviewed"]);
        assert.equal(fixture.trace.needsRepair, 1);
        assert.equal(fixture.trace.reviews, 1);
      });
    }
  } finally {
    promptRunner.runStructuredPrompt = original;
  }
});

test("user cancellation remains a batch interruption with saved prose in every repair mode", async (t) => {
  const originalStructured = promptRunner.runStructuredPrompt;
  const originalText = promptRunner.runTextPrompt;
  try {
    for (const mode of ["light_repair", "heavy_repair"]) {
      for (const failure of [
        Object.assign(new Error("Operation cancelled"), { name: "AbortError" }),
        new StreamOutcomeError("cancelled"),
        new Error("PIPELINE_CANCELLED"),
        createWrappedCancellation(),
      ]) {
        await t.test(`${mode}: ${failure.category ?? failure.name}`, async () => {
          promptRunner.runStructuredPrompt = async () => { throw failure; };
          promptRunner.runTextPrompt = async () => { throw failure; };
          const fixture = createRepairFailureFixture();
          await assert.rejects(
            runPipelineChapterWithRuntime(
              fixture.deps, "novel-1", "chapter-1", { repairMode: mode }, fixture.hooks,
            ),
            (error) => error === failure,
          );
          assert.deepEqual(fixture.trace.drafts, [{ content: fixture.content, state: "drafted" }]);
          assert.deepEqual(fixture.trace.syncs, []);
          assert.deepEqual(fixture.trace.states, ["reviewed"]);
          assert.deepEqual(fixture.trace.retries, []);
          assert.equal(fixture.trace.needsRepair, 0);
        });
      }
    }
  } finally {
    promptRunner.runStructuredPrompt = originalStructured;
    promptRunner.runTextPrompt = originalText;
  }
});

test("unknown or data-integrity errors during repair preserve interruption rather than becoming quality debt", async (t) => {
  const originalStructured = promptRunner.runStructuredPrompt;
  const originalText = promptRunner.runTextPrompt;
  try {
    for (const mode of ["light_repair", "heavy_repair"]) {
      for (const failure of [
        new TypeError("Fixture runtime contract is invalid"),
        Object.assign(new Error("Fixture foreign-key integrity failure"), { code: "P2003" }),
      ]) {
        await t.test(`${mode}: ${failure.code ?? failure.name}`, async () => {
          promptRunner.runStructuredPrompt = async () => { throw failure; };
          promptRunner.runTextPrompt = async () => { throw failure; };
          const fixture = createRepairFailureFixture();
          await assert.rejects(
            runPipelineChapterWithRuntime(
              fixture.deps, "novel-1", "chapter-1", { repairMode: mode }, fixture.hooks,
            ),
            (error) => error === failure,
          );
          assert.deepEqual(fixture.trace.drafts, [{ content: fixture.content, state: "drafted" }]);
          assert.deepEqual(fixture.trace.syncs, []);
          assert.deepEqual(fixture.trace.retries, []);
          assert.equal(fixture.trace.needsRepair, 0);
        });
      }
    }
  } finally {
    promptRunner.runStructuredPrompt = originalStructured;
    promptRunner.runTextPrompt = originalText;
  }
});

test("heavy repair timeout or stream interruption preserves the original draft as local debt", async (t) => {
  const original = promptRunner.runTextPrompt;
  try {
    for (const failure of [
      Object.assign(new Error("Fixture repair request timed out"), { name: "TimeoutError" }),
      new StreamOutcomeError("interrupted", "Unconfirmed partial rewrite"),
    ]) {
      await t.test(failure.name, async () => {
        promptRunner.runTextPrompt = async () => { throw failure; };
        const fixture = createRepairFailureFixture();
        const result = await runPipelineChapterWithRuntime(
          fixture.deps, "novel-1", "chapter-1", { repairMode: "heavy_repair" }, fixture.hooks,
        );
        assert.equal(result.pass, false);
        assert.equal(result.recoverableRepairFailure.repairMode, "heavy_repair");
        assert.equal(result.retryCountUsed, 1);
        assert.equal(result.qualityDebtAttribution.repairAttemptsUsed, 1);
        assert.deepEqual(fixture.trace.drafts, [{ content: fixture.content, state: "drafted" }]);
        assert.deepEqual(fixture.trace.syncs, [{
          content: fixture.content, artifactSyncMode: "adaptive", contentProvenance: "debt",
        }]);
        assert.equal(fixture.trace.reviews, 1);
        assert.equal(fixture.trace.needsRepair, 1);
      });
    }
  } finally {
    promptRunner.runTextPrompt = original;
  }
});

test("empty heavy repair output preserves usable prose and records exhausted local debt", async () => {
  const original = promptRunner.runTextPrompt;
  let repairCalls = 0;
  promptRunner.runTextPrompt = async () => { repairCalls += 1; return { output: "  " }; };
  try {
    const fixture = createRepairFailureFixture();
    const result = await runPipelineChapterWithRuntime(
      fixture.deps, "novel-1", "chapter-1", { repairMode: "heavy_repair" }, fixture.hooks,
    );
    assert.equal(repairCalls, 1);
    assert.equal(result.pass, false);
    assert.equal(result.recoverableRepairFailure, null);
    assert.equal(result.qualityDebtAttribution.sameObligationRepeated, true);
    assert.equal(result.qualityDebtAttribution.repairAttemptsUsed, 1);
    assert.equal(fixture.trace.reviews, 2);
    assert.deepEqual(fixture.trace.syncs, [{
      content: fixture.content, artifactSyncMode: "adaptive", contentProvenance: "debt",
    }]);
    assert.equal(fixture.trace.drafts.every((draft) => draft.content === fixture.content), true);
    assert.equal(fixture.trace.states.includes("approved"), false);
  } finally {
    promptRunner.runTextPrompt = original;
  }
});

test("final artifact persistence failures propagate after preserving the draft", async () => {
  const fixture = createRepairFailureFixture();
  const failure = new Error("Fixture artifact integrity failure");
  fixture.deps.syncFinalChapterArtifacts = async () => { throw failure; };
  await assert.rejects(
    runPipelineChapterWithRuntime(fixture.deps, "novel-1", "chapter-1", { autoRepair: false }),
    (error) => error === failure,
  );
  assert.deepEqual(fixture.trace.drafts, [{ content: fixture.content, state: "drafted" }]);
  assert.equal(fixture.trace.states.includes("approved"), false);
});

test("acceptance output and transport failure remain local warnings, but cancellation or data errors do not write fallback reports", async (t) => {
  const originalSync = openConflictService.syncFromAuditReports;
  openConflictService.syncFromAuditReports = async () => null;
  try {
    const cases = [
      ...["schema_mismatch", "transport_error", "usage_budget_exceeded"].map((category) => ({
        label: category, failure: createStructuredOutputFailure(category), local: true,
      })),
      { label: "aborted", failure: Object.assign(new Error("Operation cancelled"), { name: "AbortError" }) },
      { label: "wrapped cancellation", failure: createWrappedCancellation() },
      { label: "unknown runtime failure", failure: new TypeError("Fixture runtime contract is invalid") },
      { label: "data integrity failure", failure: Object.assign(new Error("Fixture foreign-key integrity failure"), { code: "P2003" }) },
    ];
    for (const { label, failure, local } of cases) {
      await t.test(label, async () => {
        const fixture = createRepairFailureFixture();
        const service = new ChapterAcceptanceAssessmentService();
        let reportsWritten = 0;
        service.invokeAssessment = async () => { throw failure; };
        service.persistAcceptanceReports = async () => { reportsWritten += 1; return []; };
        const assess = () => service.assess({
          novelId: "novel-1", chapterId: "chapter-1", novelTitle: "Fixture novel",
          chapterTitle: "Arrival", chapterOrder: 1, content: fixture.content, contextPackage: {},
        });
        if (local) {
          const result = await assess();
          assert.equal(result.assessment.status, "continue_with_risk");
          assert.equal(result.assessment.continuePolicy, "continue");
          assert.deepEqual(result.assessment.riskTags, ["acceptance_gate_unavailable"]);
          assert.equal(reportsWritten, 1);
        } else {
          await assert.rejects(assess, (error) => error === failure);
          assert.equal(reportsWritten, 0);
        }
      });
    }
  } finally {
    openConflictService.syncFromAuditReports = originalSync;
  }
});
