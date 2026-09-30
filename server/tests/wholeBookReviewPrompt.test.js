const test = require("node:test");
const assert = require("node:assert/strict");
const { wholeBookReviewOutputSchema } = require("../dist/prompting/prompts/novel/wholeBookReview.prompts");

test("whole-book review requires evidence-backed structured issues", () => {
  const result = wholeBookReviewOutputSchema.safeParse({
    summary: "整体稳定，但中段关系推进缺少承接。",
    strengths: ["主线清楚"],
    scores: { continuity: 80, character: 78, plot: 82, pacing: 75, voice: 85, payoff: 72, overall: 79 },
    issues: [{ category: "character", severity: "medium", title: "关系跳变", detail: "关系变化缺少过渡", evidence: ["第12章仍互不信任，第14章直接合作"], chapterOrders: [12, 14], recommendation: "补充共同选择", feedback: "在后续修订中保留关系转折的共同事件。" }],
  });
  assert.equal(result.success, true);
});

test("whole-book review rejects unsupported issue categories", () => {
  const result = wholeBookReviewOutputSchema.safeParse({
    summary: "x", strengths: [],
    scores: { continuity: 80, character: 80, plot: 80, pacing: 80, voice: 80, payoff: 80, overall: 80 },
    issues: [{ category: "guess", severity: "low", title: "x", detail: "x", evidence: [], chapterOrders: [], recommendation: "x", feedback: "x" }],
  });
  assert.equal(result.success, false);
});

test("whole-book review rejects issues without chapter evidence", () => {
  const result = wholeBookReviewOutputSchema.safeParse({
    summary: "x", strengths: [],
    scores: { continuity: 80, character: 80, plot: 80, pacing: 80, voice: 80, payoff: 80, overall: 80 },
    issues: [{ category: "plot", severity: "low", title: "x", detail: "x", evidence: [], chapterOrders: [], recommendation: "x", feedback: "x" }],
  });
  assert.equal(result.success, false);
});
