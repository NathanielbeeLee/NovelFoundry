import test from "node:test";
import assert from "node:assert/strict";
import { readCreativeHubStream, CreativeHubStreamInterruptedError } from "../src/api/creativeHub/streaming/index.ts";
import { CreativeHubStreamSession } from "../src/pages/creativeHub/runtime/index.ts";

const encoder = new TextEncoder();
const sse = (frame, separator = "\n\n") => `data: ${JSON.stringify(frame)}${separator}`;
const terminal = (status = "completed", overrides = {}) => ({
  event: "creative_hub/run_terminal",
  data: { threadId: "thread-1", runId: "run-1", checkpointId: "checkpoint-1", status, ...overrides },
});
function makeStream(chunks, tailError) {
  let index = 0;
  let cancelled = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (index < chunks.length) controller.enqueue(typeof chunks[index] === "string" ? encoder.encode(chunks[index++]) : chunks[index++]);
      else if (tailError) controller.error(tailError);
      else controller.close();
    },
    cancel() { cancelled += 1; },
  }, { highWaterMark: 0 });
  return { body, cancelled: () => cancelled };
}
async function collect(body, signal) {
  const frames = [];
  for await (const frame of readCreativeHubStream(body, "thread-1", signal)) frames.push(frame);
  return frames;
}

test("saved business terminal succeeds without needing a turn summary", async () => {
  const frames = [
    { event: "messages/complete", data: [{ id: "ai-1", type: "ai", content: "继续完善主角目标。" }] },
    terminal(),
  ];
  const stream = makeStream(frames.map((frame) => sse(frame)));
  assert.deepEqual(await collect(stream.body), frames);
  assert.equal(stream.body.locked, false);
  assert.equal(stream.cancelled(), 1);
});

test("message completion and run success announcements do not prove checkpoint completion", async () => {
  const frames = [
    { event: "creative_hub/run_status", data: { runId: "run-1", status: "succeeded" } },
    { event: "messages/complete", data: [{ id: "ai-1", type: "ai", content: "部分回复" }] },
  ];
  const stream = makeStream(frames.map((frame) => sse(frame)));
  const received = [];
  await assert.rejects(async () => {
    for await (const frame of readCreativeHubStream(stream.body, "thread-1")) received.push(frame);
  }, (error) => error instanceof CreativeHubStreamInterruptedError && error.reason === "eof");
  assert.deepEqual(received, frames);
  assert.equal(stream.body.locked, false);
});

test("flushes a split UTF-8 terminal and an unterminated final SSE event", async () => {
  const frame = terminal("completed", { message: "正文已保存" });
  const bytes = encoder.encode(sse(frame, ""));
  const chineseStart = bytes.findIndex((byte) => byte > 127);
  const stream = makeStream([bytes.slice(0, chineseStart + 1), bytes.slice(chineseStart + 1, chineseStart + 2), bytes.slice(chineseStart + 2)]);
  assert.deepEqual(await collect(stream.body), [frame]);
  assert.equal(stream.body.locked, false);
});

test("supports split CRLF, SSE comments, and multiple data lines", async () => {
  const frame = terminal("waiting_approval");
  const json = JSON.stringify(frame);
  const comma = json.indexOf(",");
  const source = `: heartbeat\r\nevent: message\r\ndata: ${json.slice(0, comma + 1)}\r\ndata: ${json.slice(comma + 1)}\r\n\r\n`;
  const chunks = Array.from(source);
  assert.deepEqual(await collect(makeStream(chunks).body), [frame]);
});

test("a known terminal survives a later transport failure or malformed tail", async () => {
  const frame = terminal();
  assert.deepEqual(await collect(makeStream([sse(frame)], new Error("connection closed")).body), [frame]);
  assert.deepEqual(await collect(makeStream([sse(frame) + "data: malformed\n\n"]).body), [frame]);
});

test("an explicit server error remains the outcome at EOF or a broken socket", async () => {
  const frame = { event: "creative_hub/error", data: { message: "保存失败，请查看任务状态。" } };
  for (const tail of [undefined, new Error("socket reset")]) {
    const stream = makeStream([sse(frame)], tail);
    assert.deepEqual(await collect(stream.body), [frame]);
    assert.equal(stream.body.locked, false);
  }
});

test("known failed and cancelled business terminals remain distinct", async () => {
  for (const status of ["failed", "cancelled"]) {
    const frame = terminal(status);
    assert.deepEqual(await collect(makeStream([sse(frame)]).body), [frame]);
  }
});

test("rejects a normal terminal without a saved checkpoint or for another run/thread", async () => {
  for (const overrides of [{ checkpointId: null }, { checkpointId: "" }, { threadId: "thread-2" }, { runId: "run-2" }]) {
    const stream = makeStream([
      sse({ event: "creative_hub/run_status", data: { runId: "run-1", status: "running" } }),
      sse(terminal("completed", overrides)),
    ]);
    await assert.rejects(collect(stream.body), (error) => error instanceof CreativeHubStreamInterruptedError && error.reason === "protocol");
    assert.equal(stream.body.locked, false);
  }
});

test("aborting before or during a read cancels the reader and keeps result unknown", async () => {
  const before = new AbortController();
  before.abort();
  const stream = makeStream([]);
  await assert.rejects(collect(stream.body, before.signal), (error) => error.reason === "aborted");
  assert.equal(stream.cancelled(), 1);
  assert.equal(stream.body.locked, false);
  const during = new AbortController();
  let cancelled = false;
  const pending = new ReadableStream({ cancel() { cancelled = true; } }, { highWaterMark: 0 });
  const collection = collect(pending, during.signal);
  during.abort();
  await assert.rejects(collection, (error) => error.reason === "aborted");
  assert.equal(cancelled, true);
  assert.equal(pending.locked, false);
});

test("an early consumer exit releases and cancels the owned reader", async () => {
  const stream = makeStream([sse({ event: "metadata", data: { ping: true } })]);
  for await (const _frame of readCreativeHubStream(stream.body, "thread-1")) break;
  assert.equal(stream.cancelled(), 1);
  assert.equal(stream.body.locked, false);
});

const base = [{ id: "old-ai", type: "ai", content: "上一轮回复" }];
const newSession = () => new CreativeHubStreamSession("thread-1", 4, "checkpoint-old", base);
const recordRun = (session) => session.accept({ event: "creative_hub/run_status", data: { runId: "run-1", status: "running" } }, 4, "thread-1");
const oldState = { messages: base, checkpointId: "checkpoint-old", latestRunId: "run-old", threadStatus: "idle" };

test("late frames from an older session or another thread cannot change the active outcome", () => {
  const session = newSession();
  assert.equal(session.accept(terminal(), 5, "thread-1"), false);
  assert.equal(session.accept(terminal(), 4, "thread-2"), false);
  assert.equal(session.runId, null);
  assert.equal(session.outcome, null);
});

test("error frames remain failed even when assistant-ui resolves or cancellation follows", () => {
  const session = newSession();
  session.accept({ event: "creative_hub/error", data: { message: "模型调用失败" } }, 4, "thread-1");
  session.fail(new Error("EOF"));
  assert.deepEqual(session.finish(), { status: "failed", message: "模型调用失败" });
  const cancelled = newSession();
  const error = new Error("reader aborted");
  error.name = "AbortError";
  cancelled.fail(error);
  assert.equal(cancelled.finish().status, "unknown");
});

test("a stale idle checkpoint cannot complete or unlock a still active disconnected run", () => {
  const session = newSession();
  recordRun(session);
  session.fail(undefined);
  const result = session.reconcile(oldState, { run: { id: "run-1", status: "running" }, hasActiveRun: true });
  assert.equal(result.outcome.status, "unknown");
  assert.equal(result.blocked, true);
  const beforeSave = session.reconcile(oldState, { run: { id: "run-1", status: "succeeded" }, hasActiveRun: false });
  assert.equal(beforeSave.blocked, true);
  assert.equal(beforeSave.outcome.status, "unknown");
});

test("only a matching new persisted checkpoint resolves an unknown completed/approval turn", () => {
  for (const [runStatus, threadStatus, expected] of [["succeeded", "idle", "completed"], ["waiting_approval", "interrupted", "waiting_approval"]]) {
    const session = newSession();
    recordRun(session);
    session.fail(undefined);
    const result = session.reconcile({ ...oldState, checkpointId: "checkpoint-1", latestRunId: "run-1", threadStatus }, {
      run: { id: "run-1", status: runStatus }, hasActiveRun: runStatus === "waiting_approval",
    });
    assert.equal(result.outcome.status, expected);
    assert.equal(result.blocked, false);
  }
});

test("refresh preserves unsaved partial replies and never marks a previous reply incomplete", () => {
  const session = newSession();
  recordRun(session);
  session.accept({ event: "messages/partial", data: [{ id: "new-ai", type: "ai", content: "收到的部分回复" }] }, 4, "thread-1");
  session.fail(undefined);
  const result = session.reconcile(oldState, { run: { id: "run-1", status: "running" }, hasActiveRun: true });
  assert.equal(result.messages[0].content, "上一轮回复");
  assert.equal(result.messages[0].status, undefined);
  assert.equal(result.messages[1].content, "收到的部分回复");
  assert.equal(result.messages[1].status.type, "incomplete");
});

test("a refreshed saved reply supersedes the matching partial message without duplication", () => {
  const session = newSession();
  recordRun(session);
  session.accept({ event: "messages/partial", data: [{ id: "new-ai", type: "ai", content: "部分" }] }, 4, "thread-1");
  session.fail(undefined);
  const complete = { id: "new-ai", type: "ai", content: "完整保存回复" };
  const result = session.reconcile({ ...oldState, messages: [...base, complete], checkpointId: "checkpoint-1", latestRunId: "run-1", threadStatus: "idle" }, {
    run: { id: "run-1", status: "succeeded" }, hasActiveRun: false,
  });
  assert.deepEqual(result.messages, [...base, complete]);
  assert.equal(result.outcome.status, "completed");
});

test("an explicit error after successful actions still waits for the matching saved checkpoint", () => {
  const session = newSession();
  recordRun(session);
  session.accept({ event: "creative_hub/error", data: { message: "检查点写入失败" } }, 4, "thread-1");
  const result = session.reconcile(oldState, { run: { id: "run-1", status: "succeeded" }, hasActiveRun: false });
  assert.equal(result.outcome.status, "failed");
  assert.match(result.outcome.message, /检查点写入失败/);
  assert.match(result.outcome.message, /部分操作可能已保存/);
  assert.equal(result.blocked, true);
});

test("an unconfirmed stale snapshot with the same message id cannot erase received text", () => {
  const session = newSession();
  recordRun(session);
  session.accept({ event: "messages/partial", data: [{ id: "new-ai", type: "ai", content: "收到的较新完整片段" }] }, 4, "thread-1");
  session.fail(undefined);
  const result = session.reconcile({ ...oldState, messages: [...base, { id: "new-ai", type: "ai", content: "收到" }] }, {
    run: { id: "run-1", status: "running" }, hasActiveRun: true,
  });
  assert.equal(result.messages.filter((message) => message.id === "new-ai").length, 1);
  assert.equal(result.messages[1].content, "收到的较新完整片段");
  assert.equal(result.messages[1].status.type, "incomplete");
});

test("a confirmed failed/cancelled task unlocks explicit follow-up without replaying any message", () => {
  for (const status of ["failed", "cancelled"]) {
    const session = newSession();
    recordRun(session);
    session.fail(undefined);
    const result = session.reconcile(oldState, { run: { id: "run-1", status }, hasActiveRun: false });
    assert.equal(result.outcome.status, status);
    assert.equal(result.blocked, false);
    assert.deepEqual(result.messages, base);
  }
});

test("no observed run id and a read-only absence of active runs does not lock forever or claim success", () => {
  const session = newSession();
  session.fail(undefined);
  const result = session.reconcile(oldState, { run: null, hasActiveRun: false });
  assert.equal(result.outcome.status, "unknown");
  assert.equal(result.blocked, false);
});

test("a rejected new request cannot disable an already persisted approval for this thread", () => {
  const session = newSession();
  session.accept({ event: "creative_hub/error", data: { message: "请先处理当前审批" } }, 4, "thread-1");
  const result = session.reconcile({ ...oldState, latestRunId: "run-1", threadStatus: "interrupted" }, {
    run: { id: "run-1", status: "waiting_approval" }, hasActiveRun: true,
  });
  assert.equal(result.outcome.status, "failed");
  assert.equal(result.blocked, false);
});
