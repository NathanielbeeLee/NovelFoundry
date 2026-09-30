import test from "node:test";
import assert from "node:assert/strict";
import { mergeLlmLiveFrames } from "./sessionProjection.ts";
import { llmLiveCacheKey, normalizeCachedSession, selectRecentLlmLiveSessions } from "../storage/llmLiveCache.ts";

function session(id = "one", phase = "completed", seq = 5) {
  return { context: { interactionId: id, label: "正文", mode: "text" }, seq, phase,
    phaseMessage: "", preview: "正文", totalChars: 2, reasoning: "思考", totalReasoningChars: 2,
    startedAt: "2026-09-11T00:00:00Z", updatedAt: `2026-09-11T00:${String(seq).padStart(2, "0")}:00Z` };
}

test("reconnect rejects duplicate and older deltas/snapshots without duplicating reasoning", () => {
  const original = session("one", "streaming");
  const frames = [
    { type: "snapshot", sessions: [{ ...original, seq: 4, reasoning: "旧" }] },
    { type: "event", event: { type: "reasoning_delta", interactionId: "one", seq: 5, at: original.updatedAt, content: "重复", totalReasoningChars: 4 } },
    { type: "event", event: { type: "reasoning_delta", interactionId: "one", seq: 6, at: original.updatedAt, content: "继续", totalReasoningChars: 4 } },
  ];
  const merged = mergeLlmLiveFrames({ one: original }, frames, new Set());
  assert.equal(merged.one.reasoning, "思考继续");
  assert.equal(merged.one.preview, "正文");
  assert.equal(merged.one.seq, 6);
});

test("clear keeps hidden sessions out of replay and snapshots", () => {
  assert.deepEqual(mergeLlmLiveFrames({}, [
    { type: "snapshot", sessions: [session()] },
    { type: "event", event: { type: "session_started", context: session().context, seq: 1, at: session().startedAt } },
  ], new Set(["one"])), {});
});

test("live memory retains active sessions plus thirty latest terminal sessions", () => {
  const sessions = Array.from({ length: 35 }, (_, index) => session(`done-${index}`, "completed", index));
  sessions.push(session("active", "streaming", 0));
  const merged = mergeLlmLiveFrames({}, [{ type: "snapshot", sessions }], new Set());
  assert.equal(Object.keys(merged).length, 31);
  assert.ok(merged.active);
  assert.equal(merged["done-0"], undefined);
  const cached = selectRecentLlmLiveSessions(sessions);
  assert.equal(cached.length, 30);
  assert.equal(cached.some(item => item.context.interactionId === "active"), false);
});

test("legacy cache gets reasoning defaults, rejects nonterminal/broken records and separates scope", () => {
  const old = session();
  delete old.reasoning;
  delete old.totalReasoningChars;
  assert.equal(normalizeCachedSession(old).reasoning, "");
  assert.equal(normalizeCachedSession(old).tokenUsage, null);
  assert.equal(normalizeCachedSession(session("active", "streaming")), null);
  assert.equal(normalizeCachedSession({ ...old, updatedAt: 123 }), null);
  assert.equal(normalizeCachedSession(null), null);
  assert.equal(llmLiveCacheKey(" x "), "llm-live:x");
  assert.equal(llmLiveCacheKey(), "llm-live:global");
});
