const assert = require("node:assert/strict");
const path = require("node:path");

// Validate isolation before importing modules that initialize the database.
const projectRoot = path.resolve(__dirname, "../../../..");
const fixtureRoot = process.env.NOVELFOUNDRY_RECOVERY_OUTPUT_DIR;
const databasePath = process.env.DATABASE_URL?.startsWith("file:")
  ? process.env.DATABASE_URL.slice("file:".length)
  : "";
assert.equal(process.env.NODE_ENV, "test");
assert.ok(fixtureRoot && path.isAbsolute(fixtureRoot), "Recovery fixtures require an explicit scratch directory.");
assert.ok(fixtureRoot.startsWith(path.join(projectRoot, ".tmp") + path.sep));
assert.ok(path.isAbsolute(databasePath), "Recovery fixtures require an absolute SQLite path.");
assert.equal(databasePath, path.resolve(databasePath));
assert.ok(databasePath.startsWith(fixtureRoot + path.sep), "Recovery fixtures must use their disposable output directory.");
assert.equal(process.env.NOVELFOUNDRY_APP_DATA_DIR, path.dirname(databasePath));
require("./denyNetwork.cjs");

const { prisma } = require("../../../dist/db/prisma.js");
const { NovelWorkflowService } = require("../../../dist/services/novel/workflow/NovelWorkflowService.js");
const { DirectorCommandService } = require("../../../dist/services/novel/director/commands/DirectorCommandService.js");
const { DirectorRuntimeStore } = require("../../../dist/services/novel/director/runtime/DirectorRuntimeStore.js");
const { DirectorNodeRunner } = require("../../../dist/services/novel/director/runtime/DirectorNodeRunner.js");

const novelId = "recovery-fixture-novel";
const taskId = "recovery-fixture-task";
const chapterIds = ["recovery-fixture-chapter-1", "recovery-fixture-chapter-2"];
const contents = ["The courier kept the first promise.", "The next delivery opened a new conflict."];

async function createProject() {
  await prisma.novel.create({ data: { id: novelId, title: "Recovery fixture" } });
  for (let index = 0; index < chapterIds.length; index++) {
    await prisma.chapter.create({ data: { id: chapterIds[index], novelId, order: index + 1, title: `Chapter ${index + 1}`, content: "" } });
  }
  await prisma.novelWorkflowTask.create({
    data: {
      id: taskId,
      novelId,
      lane: "auto_director",
      title: "Full-book recovery fixture",
      status: "waiting_approval",
      checkpointType: "chapter_batch_ready",
      seedPayloadJson: JSON.stringify({
        novelId,
        runMode: "full_book_autopilot",
        directorInput: { runMode: "full_book_autopilot" },
        autoExecution: { nextChapterId: chapterIds[0], nextChapterOrder: 1, remainingChapterIds: chapterIds, remainingChapterOrders: [1, 2] },
      }),
    },
  });
}

function buildCapabilities() {
  const workflow = new NovelWorkflowService();
  const commands = new DirectorCommandService(workflow);
  const store = new DirectorRuntimeStore();
  const runner = new DirectorNodeRunner(store);
  return { workflow, commands, store, runner };
}

function chapterContract(index, run) {
  return {
    nodeKey: "chapter_execution_node",
    label: `Write chapter ${index + 1}`,
    reads: ["chapter_task_sheet"],
    writes: ["chapter_draft"],
    mayModifyUserContent: false,
    requiresApprovalByDefault: false,
    supportsAutoRetry: false,
    run,
  };
}

function chapterInput(index) {
  return { taskId, novelId, targetType: "chapter", targetId: chapterIds[index], input: undefined };
}

function chapterArtifact(index) {
  return {
    id: `chapter_draft:chapter:${chapterIds[index]}:Chapter:${chapterIds[index]}`,
    novelId,
    artifactType: "chapter_draft",
    targetType: "chapter",
    targetId: chapterIds[index],
    version: 1,
    status: "active",
    source: "ai_generated",
    contentRef: { table: "Chapter", id: chapterIds[index] },
    schemaVersion: "recovery-fixture",
  };
}

async function writeChapter(index) {
  await prisma.chapter.update({ where: { id: chapterIds[index] }, data: { content: contents[index], generationState: "drafted" } });
  return { chapterId: chapterIds[index] };
}

async function readState() {
  const [task, commands, chapters, steps, artifacts, events] = await Promise.all([
    prisma.novelWorkflowTask.findUnique({ where: { id: taskId } }),
    prisma.directorRunCommand.findMany({ where: { taskId }, orderBy: { createdAt: "asc" } }),
    prisma.chapter.findMany({ where: { novelId }, orderBy: { order: "asc" } }),
    prisma.directorStepRun.findMany({ where: { taskId }, orderBy: { targetId: "asc" } }),
    prisma.directorArtifact.findMany({ where: { novelId }, orderBy: { id: "asc" } }),
    prisma.directorEvent.findMany({ where: { taskId }, orderBy: { occurredAt: "asc" } }),
  ]);
  return { pid: process.pid, task, commands, chapters, steps, artifacts, events };
}

async function finish(result) {
  await prisma.$disconnect();
  process.send({ type: "result", result }, () => process.exit(0));
}

async function fail(error) {
  const state = await readState().catch(() => null);
  await prisma.$disconnect().catch(() => {});
  process.send({ type: "error", error: error.stack ?? String(error), state }, () => process.exit(1));
}

module.exports = { prisma, novelId, taskId, chapterIds, contents, createProject, buildCapabilities, chapterContract, chapterInput, chapterArtifact, writeChapter, readState, finish, fail };
