const test = require("node:test");
const assert = require("node:assert/strict");
const { createCreativeHubTerminalFrame } = require("../dist/creativeHub/http/index.js");

const result = (runStatus, checkpoint = { checkpointId: "checkpoint-1", runId: "run-1" }) => ({
  runId: "run-1", runStatus, checkpoint, latestError: null,
});

test("HTTP completion requires a persisted checkpoint for this exact run", () => {
  assert.deepEqual(createCreativeHubTerminalFrame("thread-1", result("succeeded")), {
    event: "creative_hub/run_terminal",
    data: { threadId: "thread-1", runId: "run-1", checkpointId: "checkpoint-1", status: "completed" },
  });
  for (const checkpoint of [null, { checkpointId: "", runId: "run-1" }, { checkpointId: "checkpoint-old", runId: "run-old" }]) {
    assert.throws(() => createCreativeHubTerminalFrame("thread-1", result("succeeded", checkpoint)));
    assert.throws(() => createCreativeHubTerminalFrame("thread-1", result("waiting_approval", checkpoint)));
  }
});

test("approval, failure and actual cancellation have different business terminals", () => {
  assert.equal(createCreativeHubTerminalFrame("thread-1", result("waiting_approval")).data.status, "waiting_approval");
  for (const status of ["failed", "cancelled"]) {
    const frame = createCreativeHubTerminalFrame("thread-1", { ...result(status, null), latestError: "本轮任务未完成" });
    assert.equal(frame.data.status, status);
    assert.equal(frame.data.checkpointId, null);
    assert.equal(frame.data.message, "本轮任务未完成");
  }
});

test("running, queued or missing runtime results cannot manufacture a success terminal", () => {
  for (const status of ["queued", "running", null]) {
    assert.throws(() => createCreativeHubTerminalFrame("thread-1", result(status)));
  }
});
