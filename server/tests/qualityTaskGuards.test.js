const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");

let activePipelineRow = null;
let qualityRows = [];

const prismaEntry = path.resolve(__dirname, "../dist/db/prisma.js");
const previousPrismaModule = require.cache[prismaEntry];
const prismaStub = new Module(prismaEntry);
prismaStub.filename = prismaEntry;
prismaStub.loaded = true;
prismaStub.exports = {
  prisma: {
    generationJob: {
      async findFirst() {
        return activePipelineRow;
      },
    },
    qualityReport: {
      async findMany() {
        return qualityRows;
      },
    },
  },
};
require.cache[prismaEntry] = prismaStub;

const {
  startOrReuseManualPipelineJob,
} = require("../dist/modules/novel/production/application/ManualPipelineStartGuard.js");
const {
  parseWholeBookReviewRunPayload,
  rangesOverlap,
  WHOLE_BOOK_REVIEW_RUN_MARKER,
} = require("../dist/modules/novel/quality/application/wholeBookReviewRunState.js");

if (previousPrismaModule) {
  require.cache[prismaEntry] = previousPrismaModule;
} else {
  delete require.cache[prismaEntry];
}

test("manual pipeline start reuses the active same-range job without starting another job", async () => {
  activePipelineRow = { id: "job-active", startOrder: 1, endOrder: 12 };
  qualityRows = [];
  let startCount = 0;
  const service = {
    async getPipelineJob() {
      return { id: "job-active", startOrder: 1, endOrder: 12, status: "running" };
    },
    async startPipelineJob() {
      startCount += 1;
      return { id: "job-new" };
    },
  };

  const result = await startOrReuseManualPipelineJob(service, "novel-1", {
    startOrder: 1,
    endOrder: 12,
  });

  assert.equal(result.reused, true);
  assert.equal(result.job.id, "job-active");
  assert.equal(startCount, 0);
});

test("manual pipeline start rejects another range while a job is active", async () => {
  activePipelineRow = { id: "job-active", startOrder: 1, endOrder: 12 };
  qualityRows = [];
  const service = {
    async getPipelineJob() {
      return { id: "job-active", startOrder: 1, endOrder: 12, status: "running" };
    },
    async startPipelineJob() {
      throw new Error("should not start a second range");
    },
  };

  await assert.rejects(
    () => startOrReuseManualPipelineJob(service, "novel-1", { startOrder: 6, endOrder: 18 }),
    (error) => error?.statusCode === 409 && error.message.includes("已有第 1—12 章"),
  );
});

test("manual pipeline start is blocked while whole-book review is running", async () => {
  activePipelineRow = null;
  qualityRows = [{
    id: "review-active",
    novelId: "novel-1",
    updatedAt: new Date(),
    issues: JSON.stringify({
      kind: WHOLE_BOOK_REVIEW_RUN_MARKER,
      status: "running",
      startOrder: 1,
      endOrder: 12,
      sourceRevision: "revision-1",
      startedAt: new Date().toISOString(),
    }),
  }];
  const service = {
    async getPipelineJob() {
      return null;
    },
    async startPipelineJob() {
      throw new Error("should not start while review is running");
    },
  };

  await assert.rejects(
    () => startOrReuseManualPipelineJob(service, "novel-1", { startOrder: 1, endOrder: 12 }),
    (error) => error?.statusCode === 409 && error.message.includes("正在进行全书审校"),
  );
});

test("whole-book review run markers and range overlap are deterministic", () => {
  const payload = parseWholeBookReviewRunPayload(JSON.stringify({
    kind: WHOLE_BOOK_REVIEW_RUN_MARKER,
    status: "running",
    startOrder: 2,
    endOrder: 8,
    sourceRevision: "revision-2",
    startedAt: "2026-07-26T00:00:00.000Z",
  }));

  assert.equal(payload?.startOrder, 2);
  assert.equal(rangesOverlap({ startOrder: 1, endOrder: 4 }, { startOrder: 4, endOrder: 9 }), true);
  assert.equal(rangesOverlap({ startOrder: 1, endOrder: 3 }, { startOrder: 4, endOrder: 9 }), false);
});
