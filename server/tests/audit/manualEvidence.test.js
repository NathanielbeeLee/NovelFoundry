const test = require("node:test");
const assert = require("node:assert/strict");
const { manualAuditOutputSchema, calibrateManualAudit } = require("../../dist/prompting/prompts/audit/manual/schema.js");
const { eligibleReviewIssues } = require("../../dist/services/audit/manual/index.js");
const content = "她说：别走。\n他没有回答。";
function make(overrides = {}) {
  return manualAuditOutputSchema.parse({
    score: Object.fromEntries(["coherence", "repetition", "pacing", "voice", "engagement", "overall"].map((k) => [k, 80])),
    issues: [{ severity: "medium", category: "pacing", evidence: "回应缺少动作衔接。", fixSuggestion: "核对沉默的叙事作用。",
      verdict: "confirmed", excerpt: "他没有回答。", readingImpact: "读者不清楚他是否听见。", counterEvidence: "沉默可能是故意回避，但此处前后没有表现。", ...overrides }],
  });
}
function review(overrides, text = content) { return calibrateManualAudit(make(overrides), text, ["plot", "continuity", "character", "mode_fit"]); }

test("manual review preserves a grounded AI judgment and allows repair of the same snapshot", () => {
  const output = review();
  assert.equal(output.issues[0].calibration.grounding, "verified");
  assert.equal(output.issues[0].calibration.repairEligible, true);
  assert.equal(output.auditReports.flatMap((r) => r.issues).length, 1);
  assert.equal(eligibleReviewIssues(output.issues, content).length, 1);
  assert.equal(eligibleReviewIssues(output.issues, content + " ").length, 0);
  const invalidRange = structuredClone(output.issues);
  invalidRange[0].calibration.endOffset = content.length + 100;
  assert.equal(eligibleReviewIssues(invalidRange, content).length, 0);
});

test("invented, absent or wrongly positioned quotes stay visible without repair eligibility", () => {
  for (const overrides of [{excerpt: "他走开了。"}, {excerpt: ""}, {startOffset: 0, endOffset: 6}]) {
    const output = review(overrides);
    assert.equal(output.issues.length, 1);
    assert.equal(output.issues[0].calibration.verdict, "hypothesis");
    assert.equal(output.auditReports.flatMap((r) => r.issues).length, 0);
    assert.equal(eligibleReviewIssues(output.issues, content).length, 0);
  }
});

test("repeated quotes require a correct offset; surrogate pairs use exact boundaries", () => {
  const text = "别走。别走。😀";
  assert.equal(review({ excerpt: "别走。" }, text).issues[0].calibration.grounding, "ambiguous");
  assert.equal(review({ excerpt: "别走。", startOffset: 3, endOffset: 6 }, text).issues[0].calibration.repairEligible, true);
  assert.equal(review({ excerpt: "😀", startOffset: 6, endOffset: 8 }, text).issues[0].calibration.repairEligible, true);
  assert.equal(review({ excerpt: "\ud83d", startOffset: 6, endOffset: 7 }, text).issues[0].calibration.repairEligible, false);
  assert.equal(review({ excerpt: "\ud83d" }, text).issues[0].calibration.repairEligible, false);
});

test("keep/deferred/hypothesis and missing reasoning remain advisory", () => {
  for (const overrides of [{verdict: "keep"}, {verdict: "deferred"}, {verdict: "hypothesis"}, {counterEvidence: ""}, {readingImpact: ""}]) {
    const output = review(overrides);
    assert.equal(output.issues.length, 1);
    assert.equal(output.issues[0].calibration.repairEligible, false);
  }
});

test("legacy issues are supported without being labelled verified; AI score is required", () => {
  const legacy = { severity: "low", category: "voice", evidence: "作者标记的片段", fixSuggestion: "保留对白内容" };
  assert.deepEqual(eligibleReviewIssues([legacy], content), [legacy]);
  assert.equal(manualAuditOutputSchema.safeParse({ issues: [] }).success, false);
  const raw = make(); raw.issues = [];
  assert.deepEqual(calibrateManualAudit(raw, content, ["plot"]).issues, []);
});
