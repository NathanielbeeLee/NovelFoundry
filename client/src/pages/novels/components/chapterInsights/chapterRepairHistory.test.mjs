import test from "node:test";
import assert from "node:assert/strict";

import {
  parseChapterRepairHistory,
} from "./chapterRepairHistory.ts";

test("legacy quality loop history becomes an author-readable record", () => {
  const entries = parseChapterRepairHistory(
    "[quality_loop 2026-07-20T09:57:44.961Z] status=risk action=patch_repair signature=ql:abc attempt=1/3 budget=patch_repair terminal=defer_and_continue continuity_state:risk,prose_quality:risk",
  );

  assert.equal(entries.length, 1);
  assert.equal(entries[0].result, "deferred");
  assert.equal(entries[0].attempt, 1);
  assert.deepEqual(entries[0].riskSignals.map((item) => item.artifactType), ["continuity_state", "prose_quality"]);
});

test("structured repair history preserves scores and content version", () => {
  const entries = parseChapterRepairHistory(`[quality_history] ${JSON.stringify({
    version: 1,
    kind: "quality_assessment",
    evaluatedAt: "2026-07-26T10:00:00.000Z",
    source: "repair_recheck",
    operation: "repair",
    result: "passed",
    overallStatus: "valid",
    recommendedAction: "continue",
    issueCount: 0,
    issueCategories: [],
    riskSignals: [],
    scoreBefore: { coherence: 70, repetition: 70, pacing: 70, voice: 70, engagement: 70, overall: 70 },
    scoreAfter: { coherence: 86, repetition: 84, pacing: 82, voice: 88, engagement: 85, overall: 85 },
    contentVersion: "2026-07-26T09:58:00.000Z",
    contentLength: 5200,
    technicalDetails: "[quality_loop 2026-07-26T10:00:00.000Z] status=valid action=continue",
  })}`);

  assert.equal(entries[0].legacy, false);
  assert.equal(entries[0].scoreBefore?.overall, 70);
  assert.equal(entries[0].scoreAfter?.overall, 85);
  assert.equal(entries[0].contentLength, 5200);
});

test("legacy replan records remain actionable even when the chapter draft is retained", () => {
  const entries = parseChapterRepairHistory(
    "[quality_loop 2026-07-20T09:57:44.961Z] status=invalid action=replan signature=ql:replan attempt=3/3 budget=replan_window terminal=defer_and_continue rolling_window_review:invalid",
  );

  assert.equal(entries[0].result, "needs_action");
  assert.equal(entries[0].recommendedAction, "replan");
});
