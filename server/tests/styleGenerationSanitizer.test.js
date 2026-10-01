const test = require("node:test");
const assert = require("node:assert/strict");

const {
  detectForbiddenStyleEntities,
  sanitizeStyleContextForGeneration,
  resolveStyleGenerationProfile,
} = require("../dist/services/styleEngine/styleGenerationSanitizer.js");

function section(key, text) {
  return {
    key,
    title: key,
    summary: text,
    lines: [text],
    text,
    hasContent: Boolean(text),
  };
}

function contractWithSourceEntity() {
  return {
    narrative: section("narrative", "保留强冲突推进，但不要照搬北凉王世子的身份梗。"),
    character: section("character", "人物以行动和对白表现压抑情绪。"),
    language: section("language", "短句推进，减少解释。"),
    rhythm: section("rhythm", "章尾保留悬念。"),
    antiAi: section("antiAi", "避免复用《雪中悍刀行》的角色、称谓和桥段。"),
    selfCheck: section("selfCheck", "确认没有源作品实体。"),
    meta: {
      effectiveStyleProfileId: "style-1",
      taskStyleProfileId: null,
      activeSourceTargets: ["novel"],
      activeSourceLabels: ["style profile"],
      writerIncludedSections: ["narrative", "character", "language", "rhythm", "antiAi", "selfCheck"],
      plannerIncludedSections: ["narrative", "character", "language", "antiAi"],
      droppedSections: [],
      maturity: "structured",
      usesGlobalAntiAiBaseline: false,
      globalAntiAiRuleIds: [],
      styleAntiAiRuleIds: [],
    },
  };
}

function styleContext() {
  return {
    matchedBindings: [{
      id: "binding-1",
      styleProfileId: "style-1",
      targetType: "novel",
      targetId: "novel-1",
      priority: 1,
      weight: 1,
      enabled: true,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      styleProfile: {
        id: "style-1",
        name: "雪中式强冲突写法",
        description: "参考北凉王世子的压迫感，但生成时必须剥离源作品实体。",
        category: "玄幻",
        tags: [],
        applicableGenres: [],
        sourceType: "from_text",
        sourceRefId: null,
        sourceContent: "徐凤年是北凉王世子，相关称谓不能进入新书正文。",
        analysisMarkdown: "禁止复用北凉王世子、徐凤年等源作品实体。",
        status: "active",
        extractedFeatures: [],
        extractionPresets: [],
        extractionAntiAiRuleKeys: [],
        narrativeRules: {},
        characterRules: {},
        languageRules: {},
        rhythmRules: {},
        antiAiRules: [],
        createdAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
    }],
    compiledBlocks: {
      context: "",
      style: "",
      character: "",
      antiAi: "",
      output: "",
      selfCheck: "",
      contract: contractWithSourceEntity(),
      mergedRules: {
        narrativeRules: {},
        characterRules: {},
        languageRules: {},
        rhythmRules: {},
      },
      appliedRuleIds: [],
    },
    effectiveStyleProfileId: "style-1",
    taskStyleProfileId: null,
    activeSourceTargets: ["novel"],
    activeSourceLabels: ["style profile"],
    maturity: "structured",
    usesGlobalAntiAiBaseline: false,
    globalAntiAiRuleIds: [],
    styleAntiAiRuleIds: [],
  };
}

test("sanitizeStyleContextForGeneration redacts source entities from generated writing guidance", () => {
  const sanitized = sanitizeStyleContextForGeneration(
    styleContext(),
    new Date("2026-05-01T00:00:00.000Z"),
  );

  assert.ok(sanitized.sanitizedGenerationProfile);
  assert.ok(sanitized.sanitizedGenerationProfile.forbiddenEntities.includes("北凉王世子"));
  assert.deepEqual(
    detectForbiddenStyleEntities("主角被误写成北凉王世子。", sanitized),
    ["北凉王世子"],
  );

  const block = sanitized.sanitizedGenerationProfile.writingGuidance.join("\n");
  assert.match(block, /\[source-entity\]/);
  assert.doesNotMatch(block, /北凉王世子/);
  assert.doesNotMatch(block, /徐凤年/);
});

function generationPackage(context) {
  return {
    chapter: { id: "chapter-1", title: "第一章", order: 1, targetWordCount: 1200, expectation: "夺回钥匙" },
    plan: null,
    stateSnapshot: null,
    openConflicts: [],
    storyWorldSlice: null,
    characterRoster: [],
    characterDynamics: null,
    characterHardFacts: [],
    creativeDecisions: [],
    openAuditIssues: [],
    previousChaptersSummary: [],
    openingHint: "从主角行动开始",
    continuation: { enabled: false },
    styleContext: context,
    ledgerPendingItems: [],
    ledgerUrgentItems: [],
    ledgerOverdueItems: [],
    nextAction: "write_chapter",
  };
}

function safeLlmContext() {
  const context = styleContext();
  context.matchedBindings[0].styleProfile.name = "OrbitReferenceStyle";
  context.compiledBlocks.contract.narrative = section("narrative", "复用 AtlasEchoCharacter 的身份。");
  context.compiledBlocks.contract.meta.activeSourceLabels = ["OrbitReferenceStyle"];
  context.compiledBlocks.style = "AtlasEchoCharacter 的身份。";
  context.compiledBlocks.character = "AtlasEchoCharacter 的对白。";
  context.compiledBlocks.antiAi = "不要照搬 AtlasEchoCharacter。";
  context.compiledBlocks.selfCheck = "检查 AtlasEchoCharacter。";
  context.sanitizedGenerationProfile = {
    writingGuidance: ["人物以行动和对白表现情绪。", "短句推进，避免空泛总结。"],
    forbiddenEntities: ["AtlasEchoCharacter"],
    sourceProfileNames: ["OrbitReferenceStyle"],
    sanitizedAt: "2026-10-01T00:00:00.000Z",
    strategy: "llm",
  };
  return context;
}

test("generation resolution preserves existing AI guidance and source assets", () => {
  const context = safeLlmContext();
  const original = structuredClone(context);
  const profile = resolveStyleGenerationProfile(context);
  assert.equal(profile, context.sanitizedGenerationProfile);
  assert.deepEqual(sanitizeStyleContextForGeneration(context), context);
  assert.deepEqual(context, original);
  const raw = styleContext();
  const rawOriginal = structuredClone(raw);
  resolveStyleGenerationProfile(raw);
  assert.deepEqual(raw, rawOriginal);
});

test("writer, review and repair messages consume safe guidance across the wire", async () => {
  const layered = require("../dist/prompting/prompts/novel/chapterLayeredContext.js");
  const { chapterWriteContextSchema } = require("@novelfoundry/shared/types/chapterRuntime/writingContextSchemas");
  const { chapterWriterPrompt } = require("../dist/prompting/prompts/novel/chapterWriter.prompts.js");
  const { preparePromptExecution } = require("../dist/prompting/core/promptRunner.js");
  const { createRuntimeContextResolvers } = require("../dist/prompting/context/runtimeContextResolvers.js");
  const context = safeLlmContext();
  const original = structuredClone(context);
  const pkg = generationPackage(context);
  const write = chapterWriteContextSchema.parse(layered.buildChapterWriteContext({
    bookContract: layered.buildBookContractContext({ title: "独立新书" }),
    macroConstraints: null,
    volumeWindow: null,
    contextPackage: pkg,
  }));
  assert.deepEqual(write.styleGenerationGuidance, context.sanitizedGenerationProfile.writingGuidance);
  assert.match(write.styleContract.narrative.text, /AtlasEchoCharacter/);
  const blockSets = [
    layered.buildChapterWriterContextBlocks(write),
    layered.buildChapterReviewContextBlocks(layered.buildChapterReviewContext(write, pkg)),
    layered.buildChapterRepairContextBlocks(layered.buildChapterRepairContext({ writeContext: write, contextPackage: pkg, issues: [] })),
  ];
  for (const blocks of blockSets) {
    const text = blocks.map((block) => block.content).join("\n");
    assert.match(text, /短句推进，避免空泛总结/);
    assert.doesNotMatch(text, /AtlasEchoCharacter|OrbitReferenceStyle|北凉王世子|雪中悍刀行/);
  }
  const prepared = preparePromptExecution({
    asset: chapterWriterPrompt,
    promptInput: { novelTitle: "独立新书", chapterOrder: 1, chapterTitle: "第一章" },
    contextBlocks: blockSets[0],
  });
  const messages = prepared.messages.map((message) => String(message.content)).join("\n");
  assert.match(messages, /短句推进，避免空泛总结/);
  assert.doesNotMatch(messages, /AtlasEchoCharacter|OrbitReferenceStyle/);
  assert.deepEqual(context, original);

  // A recovered old payload has a raw contract but no generation-only field.
  const legacy = { ...write, styleContract: contractWithSourceEntity() };
  delete legacy.styleGenerationGuidance;
  const parsedLegacy = chapterWriteContextSchema.parse(legacy);
  const resolver = createRuntimeContextResolvers().find((item) => item.group === "style_contract");
  const legacyBlocks = await resolver.resolve({
    executionContext: { entrypoint: "chapter_pipeline", metadata: { chapterWriteContext: parsedLegacy } },
    requirement: { group: "style_contract" },
    mode: "fresh",
  });
  assert.doesNotMatch(legacyBlocks.map((block) => block.content).join("\n"), /北凉王世子|雪中悍刀行/);
  assert.match(legacyBlocks[0].content, /短句推进/);
});

test("an explicit empty generation result never falls back in planning or writing", () => {
  const layered = require("../dist/prompting/prompts/novel/chapterLayeredContext.js");
  const { buildPlannerStyleEngineSummary } = require("../dist/services/planner/plannerContextHelpers.js");
  const { buildWriterStyleContractText } = require("../dist/services/styleEngine/styleContractText.js");
  const { styleGenerationPrompt } = require("../dist/prompting/prompts/style/style.prompts.js");
  const context = safeLlmContext();
  context.sanitizedGenerationProfile.writingGuidance = [];
  const write = layered.buildChapterWriteContext({
    bookContract: layered.buildBookContractContext({ title: "独立新书" }),
    macroConstraints: null, volumeWindow: null, contextPackage: generationPackage(context),
  });
  assert.equal(buildWriterStyleContractText(write.styleContract, []), "");
  assert.deepEqual(write.styleConstraints, []);
  assert.equal(buildPlannerStyleEngineSummary(context), "无");
  assert.equal(layered.buildChapterWriterContextBlocks(write).some((block) => block.id === "style_contract"), false);
  const messages = styleGenerationPrompt.render({
    styleContractText: "", styleBlock: "AtlasEchoCharacter", characterBlock: "AtlasEchoCharacter",
    antiAiBlock: "AtlasEchoCharacter", selfCheckBlock: "AtlasEchoCharacter",
    mode: "generate", prompt: "写新书", targetLength: 1200,
  });
  assert.doesNotMatch(messages.map((message) => String(message.content)).join("\n"), /AtlasEchoCharacter/);
});

test("planner summary excludes source names while retaining reusable constraints", () => {
  const { buildPlannerStyleEngineSummary } = require("../dist/services/planner/plannerContextHelpers.js");
  for (const context of [safeLlmContext(), styleContext()]) {
    const summary = buildPlannerStyleEngineSummary(context);
    assert.match(summary, /短句推进/);
    assert.doesNotMatch(summary, /AtlasEchoCharacter|OrbitReferenceStyle|雪中式强冲突写法|北凉王世子|雪中悍刀行/);
  }
});

test("style preview, detection and automatic rewrite never reintroduce the source contract", async (t) => {
  const { AIMessageChunk } = require("@langchain/core/messages");
  const promptRunner = require("../dist/prompting/core/promptRunner.js");
  const { StyleRuntimeResolver } = require("../dist/services/styleEngine/StyleRuntimeResolver.js");
  const { StyleGenerationService } = require("../dist/services/styleEngine/StyleGenerationService.js");
  const { StyleDetectionService } = require("../dist/services/styleEngine/StyleDetectionService.js");
  const { StyleRewriteService } = require("../dist/services/styleEngine/StyleRewriteService.js");
  const context = safeLlmContext();
  context.compiledBlocks.contract.meta.styleAntiAiRuleIds = ["anti-1"];
  const original = structuredClone(context);
  t.mock.method(StyleRuntimeResolver.prototype, "resolve", async () => ({
    context, primaryProfile: context.matchedBindings[0].styleProfile,
    antiAiRules: [
      { id: "anti-1", name: "OrbitReferenceStyle", type: "forbidden", severity: "high", autoRewrite: false, promptInstruction: "不要复制 AtlasEchoCharacter。" },
      { id: "anti-2", name: "OrbitReferenceStyle", type: "risk", severity: "low", autoRewrite: true, promptInstruction: "用动作表现情绪。" },
    ],
  }));
  const textPrompts = [];
  let detectionPrompt = "";
  promptRunner.setPromptRunnerLLMFactoryForTests(async () => ({
    async *stream(messages) {
      textPrompts.push(messages.map((message) => String(message.content)).join("\n"));
      yield new AIMessageChunk("他把钥匙藏进袖口。");
    },
  }));
  promptRunner.setPromptRunnerStructuredInvokerForTests(async (input) => {
    detectionPrompt = input.messages.map((message) => String(message.content)).join("\n");
    return { data: {
      riskScore: 40, summary: "措辞重复", canAutoRewrite: true,
      violations: ["anti-1", "anti-2"].map((id) => ({
        ruleName: `[source-entity] [${id}]`, ruleType: "risk", severity: "medium",
        excerpt: "他拿起钥匙。", reason: "表达重复", suggestion: "使用人物动作", canAutoRewrite: true,
      })),
    }, rawText: "{}", meta: {} };
  });
  t.after(() => {
    promptRunner.setPromptRunnerLLMFactoryForTests();
    promptRunner.setPromptRunnerStructuredInvokerForTests();
  });
  for (const mode of ["generate", "rewrite"]) {
    const result = await new StyleGenerationService().testWrite({ styleProfileId: "style-1", mode, topic: "夺回钥匙", sourceText: "他拿起钥匙。" });
    assert.equal(result.output, "他把钥匙藏进袖口。");
    assert.equal(result.compiledBlocks, context.compiledBlocks);
    assert.match(result.compiledBlocks.style, /AtlasEchoCharacter/);
  }
  const report = await new StyleDetectionService().check({ content: "他拿起钥匙。", styleProfileId: "style-1" });
  assert.deepEqual(report.violations.map((item) => item.ruleId), ["anti-1", "anti-2"]);
  assert.equal(report.violations[0].source, "style_anti_ai");
  assert.equal(report.violations[0].severity, "high");
  assert.equal(report.violations[0].canAutoRewrite, false);
  assert.equal(report.violations[1].severity, "low");
  assert.equal(report.violations[1].canAutoRewrite, true);
  await new StyleRewriteService().rewrite({
    content: "他拿起钥匙。", styleProfileId: "style-1",
    issues: [{ ruleName: "OrbitReferenceStyle", excerpt: "他拿起钥匙。", suggestion: "避免复制 AtlasEchoCharacter，使用人物动作。" }],
  });
  for (const prompt of [...textPrompts, detectionPrompt]) {
    assert.match(prompt, /短句推进，避免空泛总结/);
    assert.doesNotMatch(prompt, /AtlasEchoCharacter|OrbitReferenceStyle|北凉王世子|雪中悍刀行/);
  }
  assert.match(detectionPrompt, /global_anti_ai_rule_ids/);
  assert.match(detectionPrompt, /\[anti-1\]/);
  assert.doesNotMatch(detectionPrompt, /source_labels=/);
  assert.match(textPrompts[0], /角色表达规则与硬性设定约束 > 写法规则 > 反AI规则/);
  assert.deepEqual(context, original);
});

test("direct style selection resolves generation guidance before previewing", async (t) => {
  const { StyleRuntimeResolver } = require("../dist/services/styleEngine/StyleRuntimeResolver.js");
  const { StyleProfileService } = require("../dist/services/styleEngine/StyleProfileService.js");
  const { AntiAiPolicyResolver } = require("../dist/services/styleEngine/AntiAiPolicyResolver.js");
  const profile = styleContext().matchedBindings[0].styleProfile;
  profile.narrativeRules = { summary: "强冲突推进，避免北凉王世子的身份。" };
  profile.languageRules = { summary: "短句推进" };
  const original = structuredClone(profile);
  t.mock.method(StyleProfileService.prototype, "getProfileById", async () => profile);
  t.mock.method(AntiAiPolicyResolver.prototype, "resolveFromBindings", async () => ({ globalBaselineRules: [], styleSpecificRules: [], effectiveRules: [] }));
  const resolved = await new StyleRuntimeResolver().resolve({ styleProfileId: profile.id });
  assert.ok(resolved.context.sanitizedGenerationProfile);
  assert.doesNotMatch(resolved.context.sanitizedGenerationProfile.writingGuidance.join("\n"), /北凉王世子/);
  assert.match(resolved.context.compiledBlocks.contract.narrative.text, /北凉王世子/);
  assert.deepEqual(profile, original);
});
