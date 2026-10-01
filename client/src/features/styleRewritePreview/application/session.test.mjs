import test from "node:test";
import assert from "node:assert/strict";
import { StyleRewritePreviewSession, styleRewritePreviewInputKey } from "./session.ts";
import { readStyleRewritePreview } from "../domain/result.ts";

const original = "林澈怀疑姐姐拿走了钥匙。他先敲门，才走进屋里。";
const candidate = "林澈疑心钥匙被姐姐拿走了。他敲过门，随后进屋。";
const input = (patch = {}) => ({
  content: original, styleProfileId: "profile-1", previewAntiAiRuleIds: ["rule-1"],
  provider: "test-provider", model: "test-model", configurationKey: "rules-v1", ...patch,
});
const report = (violations = [{ ruleName: "表达方式", excerpt: original, suggestion: "精简措辞" }]) => ({
  violations, riskScore: 15, summary: "检查原文的措辞。", appliedRuleIds: ["rule-1"],
});
const rewriteResult = (patch = {}) => ({
  content: candidate, originalContent: original,
  preservation: { status: "preserved", summary: "没有发现剧情信息变化。", findings: [] },
  ...patch,
});
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
};

test("keeps captured source, candidate and preserved assessment separate from original quality", async () => {
  const calls = [];
  const subject = new StyleRewritePreviewSession({
    detect: async (payload) => { calls.push(["detect", payload]); return report(); },
    rewrite: async (payload) => { calls.push(["rewrite", payload]); return rewriteResult(); },
  }, () => {});
  const submitted = input();
  await subject.rewrite(submitted);
  const state = subject.getState();
  assert.equal(state.operation, null);
  assert.equal(state.report.riskScore, 15);
  assert.equal(state.preview.originalContent, original);
  assert.equal(state.preview.content, candidate);
  assert.equal(state.preview.preservation.status, "preserved");
  assert.equal(submitted.content, original);
  assert.equal(calls[0][1].temperature, 0.2);
  assert.equal(calls[1][1].temperature, 0.5);
  assert.deepEqual(calls[1][1].issues, report().violations);
});

test("unchanged inputs reuse detection, changed text, rules, profile or model invalidate it", async () => {
  let detections = 0;
  const subject = new StyleRewritePreviewSession({
    detect: async () => { detections += 1; return report(); },
    rewrite: async ({ content }) => rewriteResult({ originalContent: content }),
  }, () => {});
  await subject.detect(input());
  await subject.rewrite(input());
  assert.equal(detections, 1);
  for (const patch of [
    { content: `${original} 门没锁。` }, { previewAntiAiRuleIds: ["rule-2"] },
    { configurationKey: "rules-v2" }, { styleProfileId: "profile-2" },
    { provider: "other-provider" }, { model: "other-model" },
  ]) {
    const next = input(patch);
    subject.setInput(next);
    assert.equal(subject.getState().report, null);
    assert.equal(subject.getState().preview, null);
    await subject.rewrite(next);
  }
  assert.equal(detections, 7);
});

test("a zero-violation report returns no rewrite and no invented preservation pass", async () => {
  let rewrites = 0;
  const subject = new StyleRewritePreviewSession({
    detect: async () => report([]),
    rewrite: async () => { rewrites += 1; return rewriteResult(); },
  }, () => {});
  await subject.rewrite(input());
  assert.equal(rewrites, 0);
  assert.equal(subject.getState().preview, null);
  assert.match(subject.getState().notice, /未生成修订稿/);
});

test("detection and rewriting cannot overlap for the same source", async () => {
  const pending = deferred();
  let detections = 0;
  let rewrites = 0;
  const subject = new StyleRewritePreviewSession({
    detect: () => { detections += 1; return pending.promise; },
    rewrite: async () => { rewrites += 1; return rewriteResult(); },
  }, () => {});
  const active = subject.detect(input());
  await subject.rewrite(input());
  await subject.detect(input());
  assert.equal(detections, 1);
  assert.equal(rewrites, 0);
  assert.equal(subject.getState().operation, "detect");
  pending.resolve(report());
  await active;
  assert.equal(subject.getState().operation, null);
});

test("captured inputs survive caller mutation while the detection request is pending", async () => {
  const pending = deferred();
  let rewrittenRequest;
  const subject = new StyleRewritePreviewSession({
    detect: () => pending.promise,
    rewrite: async (payload) => { rewrittenRequest = payload; return rewriteResult(); },
  }, () => {});
  const submitted = input();
  const active = subject.rewrite(submitted);
  submitted.content = "另一个场景";
  submitted.model = "another-model";
  submitted.previewAntiAiRuleIds.push("rule-2");
  pending.resolve(report());
  await active;
  assert.equal(rewrittenRequest.content, original);
  assert.equal(rewrittenRequest.model, "test-model");
  assert.deepEqual(rewrittenRequest.previewAntiAiRuleIds, ["rule-1"]);
  assert.equal(subject.getState().preview.originalContent, original);
});

test("input invalidation aborts in-flight detection and prevents an old rewrite from starting", async () => {
  const pending = deferred();
  let signal;
  let rewrites = 0;
  const subject = new StyleRewritePreviewSession({
    detect: (_, requestSignal) => { signal = requestSignal; return pending.promise; },
    rewrite: async () => { rewrites += 1; return rewriteResult(); },
  }, () => {});
  const active = subject.rewrite(input());
  subject.setInput(input({ content: "新的原文" }));
  assert.equal(signal.aborted, true);
  pending.resolve(report());
  await active;
  assert.equal(rewrites, 0);
  assert.equal(subject.getState().report, null);
  assert.equal(subject.getState().preview, null);
});

test("late results cannot replace a newer completed preview even if the transport ignores abort", async () => {
  const older = deferred();
  let signal;
  let rewrites = 0;
  const subject = new StyleRewritePreviewSession({
    detect: async () => report(),
    rewrite: async ({ content }, requestSignal) => {
      rewrites += 1;
      if (rewrites === 1) { signal = requestSignal; return older.promise; }
      return rewriteResult({ originalContent: content, content: "新的候选修订稿" });
    },
  }, () => {});
  const active = subject.rewrite(input());
  await Promise.resolve();
  const nextInput = input({ content: "新的原文" });
  subject.setInput(nextInput);
  await subject.rewrite(nextInput);
  assert.equal(signal.aborted, true);
  older.resolve(rewriteResult());
  await active;
  assert.equal(subject.getState().preview.originalContent, "新的原文");
  assert.equal(subject.getState().preview.content, "新的候选修订稿");
});

test("the live input guard rejects old results before React's invalidation effect runs", async () => {
  const pending = deferred();
  let liveKey = styleRewritePreviewInputKey(input());
  const subject = new StyleRewritePreviewSession({
    detect: () => pending.promise, rewrite: async () => rewriteResult(),
    isInputCurrent: (key) => key === liveKey,
  }, () => {});
  const active = subject.detect(input());
  liveKey = styleRewritePreviewInputKey(input({ model: "other-model" }));
  pending.resolve(report());
  await active;
  assert.equal(subject.getState().report, null);
  subject.setInput(input({ model: "other-model" }));
  assert.equal(subject.getState().operation, null);
});

test("cancelled or invalidated errors remain silent and cannot clear the current outcome", async () => {
  const pending = deferred();
  const subject = new StyleRewritePreviewSession({
    detect: () => pending.promise, rewrite: async () => rewriteResult(),
  }, () => {});
  const active = subject.detect(input());
  subject.setInput(input({ configurationKey: "rules-v2" }));
  pending.reject(new Error("request aborted"));
  await active;
  assert.equal(subject.getState().error, null);
  assert.equal(subject.getState().operation, null);
});

test("legacy responses remain unverified and mismatched original snapshots are rejected", () => {
  const legacy = readStyleRewritePreview({ content: candidate }, original);
  assert.equal(legacy.originalContent, original);
  assert.equal(legacy.preservation.status, "unverified");
  assert.throws(() => readStyleRewritePreview(rewriteResult({ originalContent: "另一段原文" }), original), /原文与本次输入不一致/);
  assert.equal(readStyleRewritePreview(rewriteResult({ originalContent: undefined }), original).preservation.status, "unverified");
});

test("grounded AI changes remain actionable across the supported story dimensions", () => {
  for (const category of ["fact", "relationship", "event_order", "foreshadowing", "certainty", "narrative_intent"]) {
    const finding = {
      category, change: "altered", originalExcerpt: "怀疑", rewrittenExcerpt: "确定",
      explanation: "猜测被写成确定事实。", suggestedAction: "保留主角尚未确认的状态。",
    };
    const changed = readStyleRewritePreview(rewriteResult({
      content: "林澈确定姐姐拿走了钥匙。",
      preservation: { status: "changed", summary: "发现剧情信息变化。", findings: [finding] },
    }), original);
    assert.equal(changed.preservation.status, "changed");
    assert.deepEqual(changed.preservation.findings, [finding]);
  }
});

test("unsupported evidence, missing findings and contradictory passes cannot appear preserved", () => {
  const finding = {
    category: "fact", change: "altered", originalExcerpt: "原文里没有的句子", rewrittenExcerpt: "林澈",
    explanation: "信息变化。", suggestedAction: "核对原文。",
  };
  for (const preservation of [
    { status: "changed", summary: "有变化", findings: [finding] },
    { status: "changed", summary: "有变化", findings: [] },
    { status: "preserved", summary: "没有变化" },
    { status: "unknown", summary: "没有变化", findings: [] },
    { status: "preserved", summary: "没有变化", findings: [{ ...finding, originalExcerpt: "林澈" }] },
    { status: "preserved", summary: "没有变化", findings: [], reason: "timeout" },
  ]) {
    assert.equal(readStyleRewritePreview(rewriteResult({ preservation }), original).preservation.status, "unverified");
  }
});

test("an unavailable comparison preserves the usable candidate with an explicit unverified outcome", () => {
  const result = readStyleRewritePreview(rewriteResult({
    preservation: { status: "unverified", summary: "检查未完成，请保留原文并重试。", findings: [], reason: "timeout" },
  }), original);
  assert.equal(result.content, candidate);
  assert.equal(result.originalContent, original);
  assert.equal(result.preservation.status, "unverified");
  assert.equal(result.preservation.reason, "timeout");
});
