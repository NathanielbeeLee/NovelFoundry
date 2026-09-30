const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const vm = require("node:vm");
const base = path.resolve(__dirname, "../dist/modules/novel/creation-studio/reference-start");
const { generateIsolatedReferenceBrief } = require(`${base}/application/referenceBriefPipeline.js`);
const { approvedBriefFingerprint, assertReferenceConfirmation } = require(`${base}/domain/referenceStartContract.js`);
const { buildOriginalDirectorContext } = require(`${base}/domain/referenceDirectorHandoff.js`);

const source = { analysisId: "source-analysis", title: "原作黑塔", documentVersionId: "source-v1", fingerprint: "source-hash", sections: [{ key: "plot_structure", content: "原作人物赤霄取得黑塔钥匙并发动七塔之战。" }] };
const abstract = { mechanisms: ["让主角每次选择获得新资源，也付出新的代价。", "用阶段性回报支撑更长的成长过程。"], creativeConstraints: "写普通人修复邻里关系的都市故事。" };
const direction = {
  id: "original-a", title: "街角修理铺", premise: "修理旧物的青年发现街坊隐藏的愿望，用一次次修复找回人与人的信任。",
  coreExperience: "从修复器物走向修复关系", protagonist: "经营小店的青年", centralConflict: "街区改造与彼此误解", endingPromise: "街坊携手留住生活的归属",
  styleKeywords: ["温暖", "持续回报"], referenceDesign: { worldPremise: "一座沿海小城的普通街区。", openingHook: "送修的收音机藏着未寄出的道歉。", progressionLoop: "修复旧物，理解旧怨，促成新的合作。", firstStagePromise: "帮第一位顾客与家人重归于好。" },
};
const interpretation = {
  understanding: "以旧物修复连接邻里的原创长篇。", recommendedNarrativeForm: "long_novel", recommendedTargetWordCount: 200000,
  confidence: 0.8, recommendationReason: "邻里关系可以形成逐层深入的故事。", recommendedWritingPlatform: "fanqie_free", writingPlatformConfidence: 0.8,
  writingPlatformReason: "日常中的持续回报适合连载。", directions: [direction, { ...direction, id: "original-b", title: "愿望收件人" }],
};
const brief = { originalIdea: "以一间修理铺连接街坊，在不断修复中重建信任的原创都市长篇。", interpretation };

function confirmationFixture() {
  const hash = approvedBriefFingerprint(brief.originalIdea, interpretation);
  return {
    state: { status: "ready", sourceFingerprint: "source-hash", approvedIntentVersionId: "intent-2", approvedBriefHash: hash },
    intentId: "intent-2", idea: brief.originalIdea, interpretation, sourceFingerprint: "source-hash",
    confirmation: { idempotencyKey: "reference-confirmation-key", directionId: direction.id, narrativeForm: "long_novel", targetWordCount: 200000, writingPlatform: "fanqie_free", expectedIntentVersionId: "intent-2", expectedBriefHash: hash },
  };
}

test("reference generator receives only abstractions and publishes only reviewed original context", async () => {
  const stages = [];
  const result = await generateIsolatedReferenceBrief(source, {
    stage: async (stage) => stages.push(stage),
    abstract: async (actualSource) => { assert.deepEqual(actualSource, source); return abstract; },
    generate: async (input) => { assert.deepEqual(input, abstract); assert.doesNotMatch(JSON.stringify(input), /赤霄|黑塔|source-analysis/); return brief; },
    review: async (actualSource, mechanisms, original) => { assert.deepEqual(actualSource, source); assert.deepEqual(mechanisms, abstract); assert.deepEqual(original, brief); return true; },
  });
  assert.deepEqual(stages, ["extracting", "generating", "reviewing"]);
  const outgoing = buildOriginalDirectorContext(result.brief.originalIdea, result.brief.interpretation.directions[0]);
  assert.deepEqual(Object.keys(outgoing), ["idea", "title", "description", "first30ChapterPromise", "bookSellingPoint", "styleTone"]);
  assert.doesNotMatch(JSON.stringify(outgoing), /赤霄|黑塔|source-analysis|analysisId|knowledgeDocumentIds|referenceBookAnalysisId/);
  assert.match(outgoing.description, /沿海小城/);
  assert.equal(outgoing.first30ChapterPromise, direction.referenceDesign.firstStagePromise);
});

test("review rejection cannot publish a brief and stops after two AI attempts", async () => {
  let generations = 0;
  const retries = [];
  await assert.rejects(generateIsolatedReferenceBrief(source, {
    stage: async () => {}, abstract: async (_, retry) => { retries.push(retry); return abstract; },
    generate: async () => { generations += 1; return brief; }, review: async () => false,
  }), /过于接近/);
  assert.equal(generations, 2);
  assert.deepEqual(retries, [false, true]);
});

test("confirm requires the exact reviewed intent and brief and rejects changed source", () => {
  assert.doesNotThrow(() => assertReferenceConfirmation(confirmationFixture()));
  for (const mutate of [
    (f) => { f.sourceFingerprint = "edited-source"; },
    (f) => { f.confirmation.expectedIntentVersionId = "intent-1"; },
    (f) => { f.confirmation.expectedBriefHash = "old-brief"; },
    (f) => { f.state.status = "reviewing"; },
    (f) => { f.idea += "偷偷加入原作人物"; },
    (f) => { f.confirmation.targetWordCount = 300000; },
    (f) => { f.confirmation.narrativeForm = "short_story"; },
    (f) => { f.confirmation.writingPlatform = "qidian_male"; },
    (f) => { f.confirmation.directionId = "unreviewed-direction"; },
    (f) => { f.state.confirmedDirectionId = "original-b"; },
  ]) {
    const fixture = confirmationFixture(); mutate(fixture);
    assert.throws(() => assertReferenceConfirmation(fixture));
  }
});

function loadSourceReader() {
  const exports = {};
  const filename = `${base}/infrastructure/referenceSourceReader.js`;
  const customRequire = (id) => {
    if (id.includes("db/prisma")) return { prisma: {} };
    if (id.includes("middleware/errorHandler")) return { AppError: class AppError extends Error {} };
    if (id === "@novelfoundry/shared/types/bookAnalysis") return { BOOK_ANALYSIS_SECTIONS: [{ key: "plot_structure" }, { key: "themes" }] };
    return require(path.resolve(path.dirname(filename), id));
  };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), { exports, require: customRequire, Set, JSON, Error });
  return exports.readReferenceSource;
}

test("source reader honors edited content, selected sections and rejects empty/unfinished sources", async () => {
  const read = loadSourceReader();
  const row = { id: "analysis", title: "参考", status: "succeeded", documentVersionId: "v1", sections: [
    { sectionKey: "plot_structure", status: "succeeded", editedContent: "用户修改的分析", structuredDataJson: '{"old":"旧结构"}', aiContent: "旧正文" },
    { sectionKey: "themes", status: "succeeded", editedContent: "不应自动加入", aiContent: "主题" },
  ] };
  const db = { bookAnalysis: { findUnique: async () => row } };
  const request = { analysisId: "analysis", sectionKeys: ["plot_structure"] };
  const first = await read(request, db);
  assert.equal(first.sections.length, 1);
  assert.equal(first.sections[0].content, "用户修改的分析");
  row.sections[0].editedContent = "用户再次修改";
  assert.notEqual((await read(request, db)).fingerprint, first.fingerprint);
  await assert.rejects(read({ ...request, sectionKeys: [] }, db));
  row.sections[0].status = "running";
  await assert.rejects(read(request, db));
  row.status = "archived";
  await assert.rejects(read(request, db));
});

function loadConfirmationService() {
  const fixture = confirmationFixture();
  const reference = { ...fixture.state, schemaVersion: 1, request: { analysisId: source.analysisId, sectionKeys: ["plot_structure"] }, sourceTitle: source.title, attemptId: "attempt", mechanisms: abstract.mechanisms };
  const row = { id: "creation-task", lane: "creation_studio", status: "waiting_approval", seedPayloadJson: JSON.stringify({ idea: brief.originalIdea, currentIntentVersionId: "intent-2", referenceStart: reference }), updatedAt: new Date(), cancelRequestedAt: null };
  let confirmation = null;
  let sourceHash = "source-hash";
  let productionCreates = 0;
  const productionRows = [];
  const tx = {
    novelWorkflowTask: {
      findUnique: async ({ where }) => where.id === row.id ? row : productionRows.find((item) => item.id === where.id),
      updateMany: async () => ({ count: 1 }),
      update: async ({ data }) => { Object.assign(row, data); return row; },
      create: async ({ data }) => { productionCreates += 1; productionRows.push(data); return data; },
    },
    creationStudioConfirmation: {
      findUnique: async () => confirmation,
      upsert: async ({ create, update }) => { confirmation = confirmation ? { ...confirmation, ...update } : create; return confirmation; },
    },
    novelIntentVersion: { findUnique: async () => ({ id: "intent-2", workflowTaskId: row.id, structuredIntentJson: JSON.stringify(interpretation) }) },
  };
  const exports = {};
  const filename = `${base}/application/ReferenceStartService.js`;
  const customRequire = (id) => {
    if (id === "node:crypto") return require(id);
    if (id.includes("db/prisma")) return { prisma: { $transaction: (callback) => callback(tx) } };
    if (id.includes("middleware/errorHandler")) return { AppError: class AppError extends Error {} };
    if (id.includes("promptRunner") || id.includes("referenceCreation.prompts")) return {};
    if (id.includes("NovelWorkflowService")) return { NovelWorkflowService: class {} };
    if (id.includes("NovelCreateResourceRecommendationService")) return {};
    if (id.includes("referenceSourceReader")) return { readReferenceSource: async () => ({ ...source, fingerprint: sourceHash }) };
    if (id.includes("referenceTaskStore")) return {
      lockReferenceTask: async () => { const seed = JSON.parse(row.seedPayloadJson); return { row, seed, reference: seed.referenceStart }; },
    };
    return require(path.resolve(path.dirname(filename), id));
  };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), { exports, require: customRequire, Set, JSON, Date, Error, setImmediate });
  return {
    service: new exports.ReferenceStartService(), row, input: fixture.confirmation,
    changeSource: (hash) => { sourceHash = hash; },
    failConfirmation: () => { confirmation.status = "failed"; },
    productionCreates: () => productionCreates,
    productionRows,
  };
}

test("confirmation rejects a changed source before allocating production", async () => {
  const fixture = loadConfirmationService();
  fixture.changeSource("new-source-hash");
  await assert.rejects(fixture.service.claimConfirmation(fixture.row.id, fixture.input), /参考分析有更新/);
  assert.equal(fixture.productionCreates(), 0);
});

test("confirmation retry reuses its stable director task and never copies source metadata", async () => {
  const fixture = loadConfirmationService();
  await fixture.service.claimConfirmation(fixture.row.id, fixture.input);
  const firstSeed = JSON.parse(fixture.row.seedPayloadJson);
  assert.ok(firstSeed.referenceStart.productionTaskId);
  assert.equal(fixture.productionCreates(), 1);
  assert.equal(fixture.productionRows[0].seedPayloadJson, JSON.stringify({ idea: brief.originalIdea }));
  await assert.rejects(fixture.service.claimConfirmation(fixture.row.id, fixture.input), /正在处理中/);
  fixture.service.finishConfirmation(fixture.row.id);
  fixture.failConfirmation();
  fixture.changeSource("source-edited-after-first-confirmation");
  await fixture.service.claimConfirmation(fixture.row.id, fixture.input);
  assert.equal(fixture.productionCreates(), 1);
  assert.equal(JSON.parse(fixture.row.seedPayloadJson).referenceStart.productionTaskId, firstSeed.referenceStart.productionTaskId);
  fixture.service.finishConfirmation(fixture.row.id);
  await assert.rejects(fixture.service.regenerate(fixture.row.id), /进入确认/);
});
