const test = require("node:test");
const assert = require("node:assert/strict");
const promptRunner = require("../../dist/prompting/core/promptRunner.js");
const { hasRegisteredPromptAsset } = require("../../dist/prompting/registry.js");
const { styleRewritePreservationPrompt } = require("../../dist/prompting/prompts/style/style.prompts.js");
const { StyleRewritePreservationService } = require("../../dist/services/styleEngine/rewrite/index.js");
const { StyleRewriteService } = require("../../dist/services/styleEngine/StyleRewriteService.js");
const { StyleRuntimeResolver } = require("../../dist/services/styleEngine/StyleRuntimeResolver.js");
const policy = require("../../dist/services/styleEngine/rewrite/domain/preservationPolicy.js");

const preserved = { status: "preserved", coverage: "complete", summary: "未发现故事内容改动。", findings: [] };
const service = new StyleRewritePreservationService();

function injectReview(t, data, capture = () => {}) {
  promptRunner.setPromptRunnerStructuredInvokerForTests(async (input) => {
    capture(input);
    return { data, repairUsed: false, repairAttempts: 0 };
  });
  t.after(() => promptRunner.setPromptRunnerStructuredInvokerForTests());
}

function finding(category, change, originalExcerpt, rewrittenExcerpt) {
  return { category, change, originalExcerpt, rewrittenExcerpt,
    explanation: "修订稿改变了原文信息。", suggestedAction: "保留原文的这项信息。" };
}

test("preservation prompt is registered and consumes both complete manuscripts", () => {
  assert.ok(hasRegisteredPromptAsset("style.rewrite.preservation", "v1"));
  const originalContent = "旧场景\n".repeat(1800) + "原文末尾的伏笔。";
  const rewrittenContent = "新措辞\n".repeat(1800) + "修订稿末尾的伏笔。";
  const prepared = promptRunner.preparePromptExecution({
    asset: styleRewritePreservationPrompt,
    promptInput: { originalContent, rewrittenContent },
  });
  const pair = JSON.parse(prepared.messages[1].content);
  assert.deepEqual(pair, { originalContent, rewrittenContent });
  assert.equal(styleRewritePreservationPrompt.repairPolicy.maxAttempts, 0);
  assert.equal(styleRewritePreservationPrompt.semanticRetryPolicy.maxAttempts, 0);
});

test("safe wording and equivalent numbers pass only through a complete AI judgment", async (t) => {
  const originalContent = "  林青递给她三枚铜钱，随后关门。\n";
  const rewrittenContent = "林青把3枚铜钱递到她手中，然后关上门。";
  let calls = 0;
  injectReview(t, preserved, (input) => {
    calls += 1;
    assert.deepEqual(JSON.parse(input.messages[1].content), { originalContent, rewrittenContent });
    assert.equal(input.temperature, 0.1);
    assert.equal(input.maxTokensCap, 2600);
    assert.equal(input.maxRepairAttempts, 0);
  });
  assert.equal((await service.check({ originalContent, rewrittenContent })).status, "preserved");
  assert.equal(calls, 1);
});

test("semantic changes remain distinct from prose quality and return grounded evidence", async (t) => {
  const cases = [
    ["fact", "added", "林青关门。", "林青关门。他藏着一封密信。", "", "他藏着一封密信。"],
    ["fact", "removed", "林青没有取走钥匙。", "林青离开房间。", "林青没有取走钥匙。", ""],
    ["relationship", "altered", "她是林青的姐姐。", "她是林青的妹妹。", "姐姐", "妹妹"],
    ["event_order", "altered", "他先关门，再递信。", "他先递信，再关门。", "先关门，再递信", "先递信，再关门"],
    ["foreshadowing", "removed", "门缝那道暗痕仍未弄清。", "他们关门离开。", "门缝那道暗痕仍未弄清。", ""],
    ["certainty", "altered", "若天亮前雨停，她才渡河。", "天亮前她渡过了河。", "若天亮前雨停，她才渡河。", "天亮前她渡过了河。"],
    ["certainty", "altered", "林青猜测她或许见过密信。", "林青知道她见过密信。", "猜测她或许", "知道她"],
    ["narrative_intent", "altered", "她拒绝签字，决定留下。", "她签了字，决定离开。", "拒绝签字，决定留下", "签了字，决定离开"],
  ];
  for (const [category, change, originalContent, rewrittenContent, before, after] of cases) {
    await t.test(`${category}: ${change} ${before || after}`, async (st) => {
      const evidence = finding(category, change, before, after);
      injectReview(st, { status: "changed", coverage: "complete", summary: "发现剧情改动。", findings: [evidence] });
      const result = await service.check({ originalContent, rewrittenContent });
      assert.equal(result.status, "changed");
      assert.deepEqual(result.findings, [evidence]);
      assert.equal(result.riskScore, undefined);
      assert.equal(result.replanRequired, undefined);
    });
  }
});

test("missing, inconsistent or invented evidence cannot produce a preservation pass", async (t) => {
  const invalidReviews = [
    {},
    { ...preserved, coverage: "partial" },
    { ...preserved, findings: [finding("fact", "added", "", "候选句")] },
    { status: "changed", coverage: "complete", summary: "changed", findings: [] },
    { status: "changed", coverage: "complete", summary: "changed", findings: [finding("fact", "altered", "编造的原句", "候选句")] },
    { status: "changed", coverage: "complete", summary: "changed", findings: [finding("fact", "altered", "原句", "")] },
  ];
  for (let i = 0; i < invalidReviews.length; i += 1) {
    await t.test(`invalid response ${i}`, async (st) => {
      injectReview(st, invalidReviews[i]);
      const result = await service.check({ originalContent: "原句", rewrittenContent: "候选句" });
      assert.equal(result.status, "unverified");
      assert.equal(result.reason, "invalid_result");
    });
  }
});

test("uncertain and partial reviews remain visibly unfinished", async (t) => {
  injectReview(t, { status: "uncertain", coverage: "complete", summary: "该处语义有歧义。", findings: [] });
  const uncertain = await service.check({ originalContent: "原句", rewrittenContent: "候选句" });
  assert.equal(uncertain.status, "unverified");
  assert.equal(uncertain.reason, "model_uncertain");
  injectReview(t, { status: "changed", coverage: "partial", summary: "只核验了一个改动。",
    findings: [finding("fact", "altered", "原句", "候选句")] });
  const partial = await service.check({ originalContent: "原句", rewrittenContent: "候选句" });
  assert.equal(partial.status, "unverified");
  assert.equal(partial.reason, "incomplete_review");
  assert.equal(partial.findings.length, 1);
});

test("oversized or empty pairs are not truncated or sent for an apparent pass", async (t) => {
  let calls = 0;
  injectReview(t, preserved, () => { calls += 1; });
  assert.equal((await service.check({ originalContent: "甲".repeat(24000), rewrittenContent: "乙" })).reason, "input_limit");
  assert.equal((await service.check({ originalContent: "甲", rewrittenContent: "  " })).reason, "invalid_result");
  assert.equal(calls, 0);
});

test("cancellation stops an in-flight check even if the adapter ignores its signal", async (t) => {
  const controller = new AbortController();
  let seenSignal;
  let begin;
  const started = new Promise((resolve) => { begin = resolve; });
  promptRunner.setPromptRunnerStructuredInvokerForTests(async (input) => {
    seenSignal = input.signal;
    begin();
    return new Promise(() => {});
  });
  t.after(() => promptRunner.setPromptRunnerStructuredInvokerForTests());
  const pending = service.check({ originalContent: "原句", rewrittenContent: "候选句", signal: controller.signal });
  await started;
  controller.abort();
  const result = await pending;
  assert.equal(result.status, "unverified");
  assert.equal(result.reason, "cancelled");
  assert.ok(seenSignal.aborted);
});

test("an already-cancelled check never invokes AI", async (t) => {
  let calls = 0;
  injectReview(t, preserved, () => { calls += 1; });
  assert.equal((await service.check({ originalContent: "原句", rewrittenContent: "候选句", signal: AbortSignal.abort() })).reason, "cancelled");
  assert.equal(calls, 0);
});

test("the bounded deadline returns unfinished and aborts the model request", async (t) => {
  const timeout = policy.STYLE_REWRITE_PRESERVATION_TIMEOUT_MS;
  policy.STYLE_REWRITE_PRESERVATION_TIMEOUT_MS = 15;
  let signal;
  promptRunner.setPromptRunnerStructuredInvokerForTests(async (input) => {
    signal = input.signal;
    return new Promise(() => {});
  });
  // Keep this fixture alive while the production deadline correctly uses unref.
  const keepAlive = setTimeout(() => {}, 1000);
  t.after(() => {
    clearTimeout(keepAlive);
    policy.STYLE_REWRITE_PRESERVATION_TIMEOUT_MS = timeout;
    promptRunner.setPromptRunnerStructuredInvokerForTests();
  });
  const result = await service.check({ originalContent: "原句", rewrittenContent: "候选句" });
  assert.equal(result.status, "unverified");
  assert.equal(result.reason, "timeout");
  assert.ok(signal.aborted);
});

test("rewrite retains exact original and candidate when comparison is unavailable", async (t) => {
  const resolve = StyleRuntimeResolver.prototype.resolve;
  const textPrompt = promptRunner.runTextPrompt;
  StyleRuntimeResolver.prototype.resolve = async () => ({ context: {}, antiAiRules: [] });
  promptRunner.runTextPrompt = async () => ({ output: "  候选句。\n" });
  promptRunner.setPromptRunnerStructuredInvokerForTests(async () => { throw new Error("offline adapter unavailable"); });
  t.after(() => {
    StyleRuntimeResolver.prototype.resolve = resolve;
    promptRunner.runTextPrompt = textPrompt;
    promptRunner.setPromptRunnerStructuredInvokerForTests();
  });
  const originalContent = "  原句。\n";
  const result = await new StyleRewriteService().rewrite({ content: originalContent, issues: [] });
  assert.equal(result.content, "候选句。");
  assert.equal(result.originalContent, originalContent);
  assert.equal(result.preservation.status, "unverified");
  assert.equal(result.preservation.reason, "unavailable");
  promptRunner.runTextPrompt = async () => ({ output: "  " });
  await assert.rejects(new StyleRewriteService().rewrite({ content: originalContent, issues: [] }), /没有返回可用修订稿/);
});
