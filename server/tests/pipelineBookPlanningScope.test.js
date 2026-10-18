const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { buildDirectorCompletionProfile } = require("@novelfoundry/shared/types/directorCompletion");

const compiled = (relative) => require.resolve(path.join(__dirname, "../dist", relative));

function loadFixture({ estimate = 1000, savedTarget = 2, advanceMode = "full_book_autopilot" } = {}) {
  const routes = [];
  const prefetches = [];
  const updates = [];
  const runs = [];
  const queries = [];
  let created;
  let novelReads = 0;
  const controlPolicy = { kickoffMode: "director_start", advanceMode, reviewCheckpoints: [] };
  const chapterRows = [1, 2].map((order) => ({ id: `c${order}`, order, title: `Chapter ${order}`, content: "" }));
  const db = {
    novel: { findUnique: async () => { novelReads++; return { id: "n1", title: "Long book", estimatedChapterCount: estimate }; } },
    chapter: {
      aggregate: async () => ({ _min: { order: 1 }, _max: { order: 2 }, _count: { order: 2 } }),
      findMany: async (input) => { queries.push(input); return chapterRows; },
    },
    generationJob: {
      findMany: async () => [],
      findUnique: async ({ select }) => select?.startedAt ? {
        completedCount: 0, totalCount: 2, retryCount: 0,
        payload: JSON.stringify({ controlPolicy, targetEndChapter: savedTarget, autoReview: false }),
      } : { status: "running", cancelRequestedAt: null },
      create: async ({ data }) => { created = { ...data, id: "j1", progress: 0, completedCount: 0, retryCount: 0 }; return created; },
      update: async ({ data }) => { updates.push(data); return data; },
    },
  };
  class RouteWindow {
    async ensureRouteWindow(novelId, fromOrder, options) {
      routes.push({ novelId, fromOrder, options });
      return { availableRouteCount: 5, extended: false };
    }
  }
  class Jit {
    async ensureExecutionReady(novelId, chapterId, options) { prefetches.push({ novelId, chapterId, options }); }
  }
  const files = {
    planning: compiled("services/novel/production/planning/index.js"),
    executor: compiled("services/novel/production/NovelPipelineExecutor.js"),
    pipeline: compiled("services/novel/novelCorePipelineService.js"),
  };
  const stubs = new Map([
    [compiled("db/prisma.js"), { prisma: db }],
    [compiled("services/novel/planning/ChapterRouteWindowService.js"), { ChapterRouteWindowService: RouteWindow }],
    [compiled("services/novel/planning/ChapterPlanJITService.js"), { ChapterPlanJITService: Jit }],
    [compiled("services/novel/volume/NovelVolumeService.js"), { NovelVolumeService: class {} }],
    [compiled("services/novel/runtime/ChapterRuntimeCoordinator.js"), { ChapterRuntimeCoordinator: class {} }],
    [compiled("services/novel/novelCoreSupport.js"), { ensureNovelCharacters: async () => {} }],
    [compiled("services/novel/novelCoreReviewService.js"), { createQualityReport: async () => { throw new Error("Review outside this fixture"); } }],
    [compiled("services/novel/quality/ChapterQualityLoopService.js"), { chapterQualityLoopService: {} }],
    [compiled("modules/novel/quality/application/polish/index.js"), { withPolishRevision: async (_input, run) => run() }],
    [compiled("llm/usageTracking.js"), { runWithLlmUsageTracking: async (_input, run) => run() }],
    [compiled("events/index.js"), { novelEventBus: { emit: async () => {} } }],
  ]);
  const cachedPaths = new Set([...stubs.keys(), ...Object.values(files)]);
  const saved = new Map([...cachedPaths].map((file) => [file, require.cache[file]]));
  let modules;
  try {
    for (const [file, exports] of stubs) require.cache[file] = { id: file, filename: file, loaded: true, exports };
    for (const file of Object.values(files)) delete require.cache[file];
    modules = Object.fromEntries(Object.entries(files).map(([name, file]) => [name, require(file)]));
  } finally {
    for (const [file, entry] of saved) {
      if (entry) require.cache[file] = entry;
      else delete require.cache[file];
    }
  }
  const coordinator = {
    async runPipelineChapter(_novelId, chapterId, options) {
      runs.push({ chapterId, options });
      return { retryCountUsed: 0, reviewExecuted: false, pass: true, score: {}, issues: [] };
    },
  };
  return { ...modules, controlPolicy, coordinator, routes, prefetches, updates, runs, queries,
    novelReads: () => novelReads, created: () => created };
}

test("batch admission stores full book size while keeping its prose range", async () => {
  const f = loadFixture();
  const service = new f.pipeline.NovelCorePipelineService();
  let scheduled;
  service.schedulePipelineExecution = (_jobId, _novelId, options) => { scheduled = options; };
  await service.startPipelineJob("n1", { startOrder: 1, endOrder: 2,
    targetEndChapter: 2, controlPolicy: f.controlPolicy, autoReview: false });

  const job = f.created();
  assert.deepEqual([job.startOrder, job.endOrder, job.totalCount], [1, 2, 2]);
  assert.equal(JSON.parse(job.payload).targetEndChapter, 1000);
  assert.equal(scheduled.targetEndChapter, 1000);
  assert.deepEqual([scheduled.startOrder, scheduled.endOrder], [1, 2]);
  assert.deepEqual(f.queries[0].where.order, { gte: 1, lte: 2 });
  assert.equal(f.routes[0].options.completionProfile.mode, "serial_book");
  assert.equal(f.routes[0].options.completionProfile.endingRequiredBy, 1000);
});

test("legacy resumed payload uses the same full book profile for planning, JIT and writing", async () => {
  const f = loadFixture({ savedTarget: 2 });
  await new f.executor.NovelPipelineExecutor(f.coordinator).execute("j1", "n1", {
    startOrder: 1, endOrder: 2, targetEndChapter: 2, controlPolicy: f.controlPolicy, autoReview: false,
  });

  assert.deepEqual(f.runs.map(({ chapterId }) => chapterId), ["c1", "c2"]);
  assert.ok(f.runs.every(({ options }) => options.targetEndChapter === 1000));
  assert.deepEqual(f.routes.map(({ fromOrder }) => fromOrder), [1, 2]);
  assert.equal(f.prefetches.length, 1);
  const profiles = [...f.routes, ...f.prefetches].map(({ options }) => options.completionProfile);
  assert.ok(profiles.every((profile) => profile === profiles[0]), "one resolved profile per execution");
  assert.ok(profiles.every((profile) => profile.targetChapterCount === 1000 && profile.mode === "serial_book"));
  assert.deepEqual(f.queries[0].where.order, { gte: 1, lte: 2 });
  assert.equal(f.updates.at(-1).status, "succeeded");
  assert.equal(JSON.parse(f.updates.at(-1).payload).targetEndChapter, 1000);
  assert.ok(f.updates.every(({ endOrder }) => endOrder === undefined || endOrder === 2));
});

for (const [label, estimate, targetEndChapter, expected] of [
  ["persisted estimate wins over an older full-book target", 180, 1000, 180],
  ["stored director target fills an absent estimate", null, 1000, 1000],
  ["invalid estimate falls back to the stored target", 0, 300, 300],
  ["legacy job without book size retains its batch fallback", null, undefined, 10],
  ["smaller estimate does not contract the approved batch", 5, undefined, 10],
]) {
  test(label, async () => {
    const f = loadFixture({ estimate });
    const options = { startOrder: 1, endOrder: 10, targetEndChapter, controlPolicy: f.controlPolicy };
    const profile = await f.planning.ensurePipelineRoute("n1", options);
    assert.equal(profile.targetChapterCount, expected);
    assert.deepEqual(options, { startOrder: 1, endOrder: 10, targetEndChapter, controlPolicy: f.controlPolicy });
    assert.deepEqual(f.routes[0].options.completionProfile, buildDirectorCompletionProfile(expected));
  });
}

test("ordinary manual batches retain book context without materializing routes", async () => {
  const f = loadFixture();
  const profile = await f.planning.ensurePipelineRoute("n1", { startOrder: 1, endOrder: 10 });
  assert.equal(profile.targetChapterCount, 1000);
  assert.equal(profile.mode, "serial_book");
  assert.equal(f.novelReads(), 1);
  assert.equal(f.routes.length, 0);
});

test("book size cannot make a reversed execution range valid", async () => {
  const f = loadFixture();
  await assert.rejects(f.planning.ensurePipelineRoute("n1", {
    startOrder: 20, endOrder: 10, controlPolicy: f.controlPolicy,
  }), /起点不能超过终点/);
  assert.equal(f.routes.length, 0);
});

for (const advanceMode of ["manual", "auto_to_execution"]) {
  test(`${advanceMode} admission and execution use book size without rolling route generation`, async () => {
    const f = loadFixture({ advanceMode });
    const service = new f.pipeline.NovelCorePipelineService();
    service.schedulePipelineExecution = () => {};
    const options = { startOrder: 1, endOrder: 2, targetEndChapter: 2,
      controlPolicy: f.controlPolicy, autoReview: false };
    await service.startPipelineJob("n1", options);
    await new f.executor.NovelPipelineExecutor(f.coordinator).execute("j1", "n1", options);
    assert.equal(JSON.parse(f.created().payload).targetEndChapter, 1000);
    assert.ok(f.runs.every(({ options }) => options.targetEndChapter === 1000));
    assert.deepEqual(f.runs.map(({ chapterId }) => chapterId), ["c1", "c2"]);
    assert.equal(f.routes.length, 0);
    assert.equal(f.prefetches.length, 0);
  });
}

test("director's small range keeps its stored full-book target when starting one chapter", async () => {
  const { NovelDirectorAutoExecutionRuntime } = require("../dist/services/novel/director/automation/novelDirectorAutoExecutionRuntime.js");
  const stopped = new Error("stop after capturing admitted chapter scope");
  let captured;
  const runtime = new NovelDirectorAutoExecutionRuntime({
    tokenBudgetService: { evaluateBoundary: async () => ({ status: "unlimited" }) },
    novelContextService: { listChapters: async () => [{ id: "c1", order: 1, content: "", generationState: "planned", expectation: "Begin the investigation" }] },
    novelService: {
      findActivePipelineJobForRange: async () => null,
      startPipelineJob: async (_novelId, options) => { captured = options; throw stopped; },
    },
    workflowService: {
      bootstrapTask: async () => {}, getTaskById: async () => ({ status: "running" }), markTaskRunning: async () => {},
    },
    buildDirectorSeedPayload: (_request, _novelId, extra) => extra,
  });
  const profile = buildDirectorCompletionProfile(1000);
  const range = { mode: "chapter_range", startOrder: 1, endOrder: 10 };
  await assert.rejects(runtime.runFromReady({ taskId: "t1", novelId: "n1",
    request: { idea: "Long story", candidate: { id: "candidate", workingTitle: "Book", targetChapterCount: 1000 },
      runMode: "full_book_autopilot", estimatedChapterCount: 1000, autoExecutionPlan: range },
    existingState: { ...range, enabled: true, totalChapterCount: 10, firstChapterId: "c1", completionProfile: profile },
  }), (error) => error === stopped);
  assert.deepEqual([captured.startOrder, captured.endOrder, captured.targetEndChapter], [1, 1, 1000]);
});
