const assert = require("node:assert/strict");
const { taskId, chapterIds, contents, createProject, buildCapabilities, writeChapter, readState, finish, fail } = require("./persistedProject.cjs");
const { buildFixtureWorker } = require("./executionFixture.cjs");
const { NovelWorkflowRuntimeService } = require("../../../dist/services/novel/workflow/NovelWorkflowRuntimeService.js");

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main(mode) {
  const capabilities = buildCapabilities();
  const executedChapterIds = [];
  const worker = buildFixtureWorker(capabilities, async index => {
    if (mode === "crash" && index === 1) {
      const state = await readState();
      assert.equal(state.commands[0].status, "running");
      assert.equal(state.steps[0].status, "succeeded");
      assert.equal(state.steps[1].status, "running");
      assert.equal(state.chapters[0].content, contents[0]);
      assert.equal(state.chapters[1].content, "");
      process.send({ type: "ready", result: { ...state, executedChapterIds } });
      // Lease renewal keeps this process alive until the harness sends SIGKILL.
      return new Promise(() => {});
    }
    executedChapterIds.push(chapterIds[index]);
    return writeChapter(index);
  }, `fixture-${mode}-${process.pid}`);

  if (mode === "crash") {
    await createProject();
    await capabilities.commands.enqueueContinueCommand(taskId);
    await worker.tick("slot-1");
    throw new Error("The crash fixture unexpectedly returned.");
  }
  assert.ok(["standalone-restart", "application-restart"].includes(mode));
  const persisted = await readState();
  const leaseExpiry = new Date(persisted.commands[0].leaseExpiresAt).getTime();
  await delay(Math.max(1, leaseExpiry - Date.now() + 25));
  let blockedState;
  let recoveryAcceptance;
  if (mode === "application-restart") {
    const runtime = new NovelWorkflowRuntimeService(capabilities.workflow, capabilities.commands);
    await runtime.markPendingAutoDirectorTasksForManualRecovery();
    const pending = await readState();
    assert.equal(pending.task.pendingManualRecovery, true);
    assert.equal(pending.task.status, "queued");
    assert.equal(await worker.tick("slot-1"), false, "Startup recovery must wait for explicit user recovery.");
    blockedState = await readState();
    assert.equal(blockedState.task.pendingManualRecovery, true);
    assert.equal(blockedState.commands[0].status, "stale");
    assert.equal(blockedState.steps[1].status, "failed");
    assert.deepEqual(executedChapterIds, []);
    recoveryAcceptance = await capabilities.commands.enqueueRecoveryCommand(taskId);
    assert.equal((await readState()).task.pendingManualRecovery, false);
  }

  assert.equal(await worker.tick("slot-1"), true);
  const state = await readState();
  assert.deepEqual(executedChapterIds, [chapterIds[1]], "The persisted first chapter must be reused across processes.");
  assert.deepEqual(state.chapters.map(chapter => chapter.content), contents);
  assert.equal(state.task.pendingManualRecovery, false);
  assert.equal(state.steps.length, 2);
  assert.ok(state.steps.every(step => step.status === "succeeded"));
  assert.ok(state.steps.every(step => step.error === null), "Recovered steps must not expose obsolete failure messages.");
  assert.equal(state.steps[0].id, persisted.steps[0].id);
  assert.equal(state.steps[0].finishedAt.toISOString(), persisted.steps[0].finishedAt.toISOString());
  assert.equal(state.artifacts.length, 2);
  assert.deepEqual(state.artifacts[0], persisted.artifacts[0]);
  const cursor = JSON.parse(state.task.seedPayloadJson).autoExecution;
  assert.deepEqual(cursor.remainingChapterIds, []);
  if (mode === "standalone-restart") {
    assert.equal(state.commands.length, 1);
    assert.equal(state.commands[0].id, persisted.commands[0].id);
    assert.equal(state.commands[0].attempt, 2);
    assert.equal(state.commands[0].status, "succeeded");
  } else {
    assert.equal(state.commands.length, 2);
    assert.equal(state.commands[0].status, "stale");
    assert.equal(state.commands[1].id, recoveryAcceptance.commandId);
    assert.equal(state.commands[1].status, "succeeded");
  }
  await finish({ ...state, executedChapterIds, blockedState, recoveryAcceptance });
}

main(process.argv[2]).catch(fail);
