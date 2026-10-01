const assert = require("node:assert/strict");
const { taskId, novelId, chapterIds, chapterContract, chapterInput, chapterArtifact } = require("./persistedProject.cjs");
const { DirectorWorker } = require("../../../dist/workers/directorWorker.js");
const { DirectorTaskQueue } = require("../../../dist/workers/DirectorTaskQueue.js");
const { DirectorCommandExecutor } = require("../../../dist/services/novel/director/commands/DirectorCommandExecutor.js");

function buildFixtureWorker(capabilities, runChapter, workerId) {
  const { workflow, commands, store, runner } = capabilities;
  const directorService = {
    async executeContinueTask(id, input) {
      assert.equal(id, taskId);
      assert.equal(input.forceResume, true);
      await store.initializeRun({ taskId, novelId, entrypoint: "recovery-fixture", policyMode: "run_until_gate" });
      for (let index = 0; index < chapterIds.length; index++) {
        await workflow.markTaskRunning(taskId, {
          stage: "chapter_execution",
          itemKey: "chapter_execution",
          itemLabel: `Writing fixture chapter ${index + 1}`,
          chapterId: chapterIds[index],
          progress: 0.6 + index * 0.1,
        });
        const result = await runner.run(
          chapterContract(index, () => runChapter(index)),
          chapterInput(index),
          () => [chapterArtifact(index)],
        );
        assert.equal(result.status, "completed", result.reason);
        await workflow.markTaskRunning(taskId, {
          stage: "chapter_execution",
          itemKey: "chapter_execution",
          itemLabel: "Saving fixture recovery cursor",
          chapterId: chapterIds[index + 1] ?? chapterIds[index],
          seedPayload: {
            autoExecution: {
              nextChapterId: chapterIds[index + 1] ?? null,
              nextChapterOrder: index + 1 < chapterIds.length ? index + 2 : null,
              remainingChapterIds: chapterIds.slice(index + 1),
              remainingChapterOrders: chapterIds.slice(index + 1).map((_, offset) => index + offset + 2),
            },
          },
        });
      }
      // The fixture completes an orchestration range, not real novel acceptance.
      await workflow.markTaskWaitingApproval(taskId, {
        stage: "chapter_execution",
        itemKey: "fixture_range_complete",
        itemLabel: "Fixture chapter range complete",
        checkpointType: "chapter_batch_ready",
        checkpointSummary: "Fixture chapter range complete",
        progress: 0.95,
      });
    },
  };
  return new DirectorWorker({
    queue: new DirectorTaskQueue({ workerId, executionSlots: 1, pollMs: 1 }, commands),
    commandExecutor: new DirectorCommandExecutor({ directorService, workflowService: workflow, commandService: commands }),
  });
}

module.exports = { buildFixtureWorker };
