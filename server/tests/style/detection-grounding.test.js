const test = require("node:test");
const assert = require("node:assert/strict");
const promptRunner = require("../../dist/prompting/core/promptRunner.js");
const { getRegisteredPromptAsset } = require("../../dist/prompting/registry.js");
const { styleDetectionPrompt } = require("../../dist/prompting/prompts/style/style.prompts.js");

function report(excerpt) {
  return {
    riskScore: 57,
    summary: "该片段的表达需要检查。",
    canAutoRewrite: true,
    violations: [{
      ruleName: "表达规则", ruleType: "style", severity: "medium",
      issueCategory: "style_expression", excerpt,
      reason: "该表达与当前写法要求冲突。", suggestion: "保留信息并调整表达。",
      canAutoRewrite: true,
    }],
  };
}

function runDetection(content) {
  return promptRunner.runStructuredPrompt({
    asset: styleDetectionPrompt,
    promptInput: { content, styleContractText: "保留人物声音。", styleContractMetaText: "none", antiRuleCatalogText: "none" },
  });
}

function inject(t, data, onCall = () => {}) {
  promptRunner.setPromptRunnerStructuredInvokerForTests(async () => {
    onCall();
    return { data, repairUsed: false, repairAttempts: 0 };
  });
  t.after(() => promptRunner.setPromptRunnerStructuredInvokerForTests());
}

test("style detection registers its grounded-evidence contract", () => {
  assert.equal(getRegisteredPromptAsset("style.detection", "v4"), styleDetectionPrompt);
});

test("literal evidence preserves the AI judgment, including punctuation, line breaks and repeated text", async (t) => {
  const content = "她说：‘别走。’\n他没有回答。\n她说：‘别走。’";
  for (const excerpt of ["她说：‘别走。’", "‘别走。’\n他没有回答。", "  他没有回答。  "]) {
    await t.test(excerpt, async (st) => {
      const modelReport = report(excerpt);
      inject(st, modelReport);
      const result = await runDetection(content);
      assert.deepEqual(result.output, {
        ...modelReport,
        violations: [{ ...modelReport.violations[0], excerpt: excerpt.trim() }],
      });
    });
  }
});

test("unsupported or empty excerpts fail execution instead of becoming a clean report", async (t) => {
  const content = "她说：‘别走。’\n他没有回答。";
  for (const excerpt of ["", " \n ", "他转身离开。", "她说：‘别走。’ 他没有回答。", "她说:‘别走。’", "她说……他没有回答。"]) {
    await t.test(JSON.stringify(excerpt), async (st) => {
      let calls = 0;
      inject(st, report(excerpt), () => { calls += 1; });
      await assert.rejects(runDetection(content), (error) => {
        assert.equal(error.promptQualityFailureKind, "post_validate_failed");
        return true;
      });
      assert.equal(calls, 1, "evidence validation must not add a model call");
    });
  }
});

test("an AI assessment without violations remains valid", async (t) => {
  const data = { riskScore: 0, summary: "没有发现违规。", canAutoRewrite: false, violations: [] };
  inject(t, data);
  assert.deepEqual((await runDetection("普通的叙事段落。")).output, data);
});
