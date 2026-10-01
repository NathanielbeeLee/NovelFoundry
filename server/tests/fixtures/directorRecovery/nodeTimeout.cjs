const assert = require("node:assert/strict");
const { taskId, chapterIds, contents, createProject, buildCapabilities, writeChapter, readState, finish, fail } = require("./persistedProject.cjs");
const { buildFixtureWorker } = require("./executionFixture.cjs");
const { runWithEnforcedTimeout } = require("../../../dist/llm/invokeTimeout.js");

async function main() {
  await createProject();
  let timeoutName;
  let providerAborted = false;
  const generatedChapterIds = [];
  const capabilities = buildCapabilities();
  const worker = buildFixtureWorker(capabilities, async index => {
    if (index === 0) {
      generatedChapterIds.push(chapterIds[index]);
      return writeChapter(index);
    }
    try {
      return await runWithEnforcedTimeout({
        label: "fixture-model",
        timeoutMs: 25,
        run: signal => new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            providerAborted = true;
            reject(signal.reason);
          }, { once: true });
        }),
      });
    } catch (error) {
      timeoutName = error.name;
      throw error;
    }
  }, "timeout-worker");
  await capabilities.commands.enqueueContinueCommand(taskId);
  assert.equal(await worker.tick("slot-1"), true);
  const afterTimeout = await readState();
  assert.equal(timeoutName, "TimeoutError");
  assert.equal(providerAborted, true);
  assert.equal(afterTimeout.task.pendingManualRecovery, true);
  assert.equal(afterTimeout.commands[0].status, "failed");
  assert.match(afterTimeout.commands[0].errorMessage, /fixture-model.*timed out after 25ms/);
  assert.deepEqual(afterTimeout.steps.map(step => step.status), ["succeeded", "failed"]);
  assert.match(afterTimeout.steps[1].error, /timed out after 25ms/);
  assert.equal(afterTimeout.chapters[0].content, contents[0]);
  assert.equal(afterTimeout.chapters[1].content, "");
  assert.equal(afterTimeout.artifacts.length, 1);
  const historicalFailure = afterTimeout.events.find(event => event.type === "node_failed");
  assert.ok(historicalFailure);
  assert.match(historicalFailure.summary, /fixture-model.*timed out after 25ms/);

  // Recreate capabilities to require reuse from persistence, not cached state.
  const recovered = buildCapabilities();
  let retryRunningState;
  const recoveredWorker = buildFixtureWorker(recovered, async index => {
    retryRunningState = await readState();
    generatedChapterIds.push(chapterIds[index]);
    return writeChapter(index);
  }, "recovered-timeout-worker");
  const recoveryAcceptance = await recovered.commands.enqueueContinueCommand(taskId);
  assert.equal((await readState()).task.pendingManualRecovery, false);
  assert.equal(await recoveredWorker.tick("slot-1"), true);
  const afterRecovery = await readState();
  assert.deepEqual(generatedChapterIds, chapterIds, "The completed chapter must not be regenerated after a model timeout.");
  assert.deepEqual(afterRecovery.chapters.map(chapter => chapter.content), contents);
  assert.equal(afterRecovery.task.pendingManualRecovery, false);
  assert.deepEqual(afterRecovery.commands.map(command => command.status), ["failed", "succeeded"]);
  assert.equal(afterRecovery.commands[1].id, recoveryAcceptance.commandId);
  assert.equal(afterRecovery.steps.length, 2);
  assert.ok(afterRecovery.steps.every(step => step.status === "succeeded"));
  assert.deepEqual(afterRecovery.steps.map(step => step.id), afterTimeout.steps.map(step => step.id));
  assert.equal(retryRunningState.steps[1].status, "running");
  assert.equal(retryRunningState.steps[1].finishedAt, null, "An active retry must not keep its old completion timestamp.");
  assert.equal(retryRunningState.steps[1].error, null, "An active retry must not expose an obsolete error.");
  assert.equal(afterRecovery.steps[1].error, null, "A successful retry must not expose an obsolete error.");
  assert.deepEqual(afterRecovery.events.find(event => event.id === historicalFailure.id), historicalFailure, "Successful recovery must preserve the historical failure event.");
  assert.equal(afterRecovery.artifacts.length, 2);
  assert.deepEqual(afterRecovery.artifacts[0], afterTimeout.artifacts[0]);
  await finish({ pid: process.pid, afterTimeout, retryRunningState, afterRecovery, generatedChapterIds, providerAborted, timeoutName, recoveryAcceptance });
}

main().catch(fail);
