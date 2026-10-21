const test = require("node:test");
const assert = require("node:assert/strict");
const { buildVolumeWorkspaceDocument } = require("../dist/services/novel/volume/volumeWorkspaceDocument.js");
const { appendRouteCandidates, countContinuousRouteWindow } = require("../dist/services/novel/volume/workspace/routeWindow/domain/RouteWindowPolicy.js");
const now = new Date(0).toISOString();
const chapter = (order, volumeId = "v1") => ({ id: `p${order}`, volumeId, chapterOrder: order, beatKey: "open_hook",
  title: `Chapter ${order}`, summary: "Saved plan", payoffRefs: [], createdAt: now, updatedAt: now });
const volume = (id, sortOrder, chapters = []) => ({ id, novelId: "novel-1", sortOrder, title: `Volume ${sortOrder}`,
  openPayoffs: [], status: "active", chapters, createdAt: now, updatedAt: now });
const sheet = (volumeId, volumeSortOrder, chapterSpanHint = "1-4章") => ({ volumeId, volumeSortOrder, status: "generated",
  beats: [{ key: "open_hook", label: "Opening", summary: "Saved beat", chapterSpanHint, mustDeliver: ["opening"] }] });
const strategyPlan = { recommendedVolumeCount: 2, hardPlannedVolumeCount: 2, readerRewardLadder: "progress", escalationLadder: "progress",
  midpointShift: "turn", notes: "fixture", volumes: [], uncertainties: [] };
const workspace = (volumes, beatSheets) => buildVolumeWorkspaceDocument({ novelId: "novel-1", volumes, beatSheets, strategyPlan });

function fixture(initial, executionOrders, generate) {
  let state = structuredClone(initial), revision = 0;
  const executions = executionOrders.map(order => ({ id: `c${order}`, order }));
  const db = { chapter: { findMany: async ({ where }) => executions.filter(item => item.order >= where.order.gte && item.order <= (where.order.lte ?? Infinity)) } };
  const snapshot = () => ({ document: structuredClone(state), revision: String(revision) });
  const service = {
    readRouteWindowWorkspace: async () => snapshot(),
    appendRouteWindow: async (_id, generated, expected, options) => {
      assert.equal(expected.revision, String(revision));
      state = appendRouteCandidates(state, generated, options);
      for (const item of state.volumes.flatMap(volume => volume.chapters)) {
        if (item.chapterOrder > (options.endOrder ?? Infinity)) continue;
        let row = executions.find(row => row.order === item.chapterOrder);
        if (!row) { row = { id: `c${item.chapterOrder}`, order: item.chapterOrder }; executions.push(row); }
        item.chapterId = row.id;
      }
      revision++;
      return snapshot();
    },
    generateVolumes: async (_id, options) => {
      assert.equal(options.persistIntermediateDocuments, false);
      assert.equal(options.entrypoint, "jit_route_window");
      return generate(options);
    },
    getVolumes: async () => { throw new Error("JIT must use read-only snapshot"); },
    updateVolumesWithOptions: async () => { throw new Error("JIT must not replace saved workspace"); },
    syncVolumeChaptersWithOptions: async () => { throw new Error("JIT must not synchronize over saved execution rows"); },
  };
  const mocks = [
    [require.resolve("../dist/db/prisma.js"), { prisma: db }],
    [require.resolve("../dist/services/novel/volume/NovelVolumeService.js"), { NovelVolumeService: class {}, countContinuousRouteWindow }],
  ];
  const servicePath = require.resolve("../dist/services/novel/planning/ChapterRouteWindowService.js");
  const original = new Map([...mocks.map(([id]) => id), servicePath].map(id => [id, require.cache[id]]));
  let RouteService;
  try {
    for (const [id, exports] of mocks) require.cache[id] = { id, filename: id, loaded: true, exports };
    delete require.cache[servicePath];
    RouteService = require(servicePath).ChapterRouteWindowService;
  } finally {
    for (const [id, prior] of original) { if (prior) require.cache[id] = prior; else delete require.cache[id]; }
  }
  return { route: new RouteService(service), executions, state: () => state };
}

test("route window adds a future skeleton, beat sheet and route through append commits only", async () => {
  const first = volume("v1", 1, [chapter(1)]), firstSheet = sheet("v1", 1, "1章");
  const scopes = [];
  const fx = fixture(workspace([first], [firstSheet]), [1], async options => {
    scopes.push(options.scope);
    if (options.scope === "skeleton") return workspace([first, volume("v2", 2)], [firstSheet]);
    if (options.scope === "beat_sheet") return workspace(options.draftWorkspace.volumes, [firstSheet, sheet("v2", 2, "1章")]);
    return workspace(options.draftWorkspace.volumes.map(item => item.id === "v2" ? { ...item, chapters: [chapter(2, "v2")] } : item), options.draftWorkspace.beatSheets);
  });
  const result = await fx.route.ensureRouteWindow("novel-1", 2, { min: 1, target: 1, completionProfile: { targetChapterCount: 80 } });
  assert.deepEqual(scopes, ["skeleton", "beat_sheet", "chapter_list"]);
  assert.deepEqual(result, { availableRouteCount: 1, extended: true });
});

test("saved plans rebuild missing execution rows before any AI generation", async () => {
  const fx = fixture(workspace([volume("v1", 1, [chapter(1), chapter(2), chapter(3)])], [sheet("v1", 1)]), [1, 3], () => { throw new Error("AI must not run"); });
  const result = await fx.route.ensureRouteWindow("novel-1", 1, { min: 3, target: 3, completionProfile: { targetChapterCount: 80 } });
  assert.deepEqual(result, { availableRouteCount: 3, extended: false });
  assert.deepEqual(fx.executions.map(row => row.order).sort(), [1, 2, 3]);
});

test("later execution rows do not hide a missing planned chapter in the current window", async () => {
  let calls = 0;
  const fx = fixture(workspace([volume("v1", 1, [chapter(1), chapter(3)])], [sheet("v1", 1)]), [1, 3, 4], async options => {
    calls++;
    const next = structuredClone(options.draftWorkspace); next.volumes[0].chapters.push(chapter(2));
    return next;
  });
  const result = await fx.route.ensureRouteWindow("novel-1", 1, { min: 3, target: 3, completionProfile: { targetChapterCount: 80 } });
  assert.equal(calls, 1);
  assert.equal(result.availableRouteCount, 3);
});

test("route windows stop at the real book end without generating unnecessary routes", async () => {
  const fx = fixture(workspace([volume("v1", 1, [chapter(3)])], [sheet("v1", 1)]), [3, 4, 5], () => { throw new Error("AI must not run"); });
  const result = await fx.route.ensureRouteWindow("novel-1", 3, { min: 3, target: 5, completionProfile: { targetChapterCount: 3 } });
  assert.equal(result.availableRouteCount, 1);
  assert.deepEqual(await fx.route.ensureRouteWindow("novel-1", 4, { completionProfile: { targetChapterCount: 3 } }), { availableRouteCount: 0, extended: false });
});

test("no-progress generation stops once with the saved planning intact", async () => {
  const initial = workspace([volume("v1", 1, [chapter(1)])], [sheet("v1", 1)]);
  let calls = 0;
  const fx = fixture(initial, [1], async options => { calls++; return options.draftWorkspace; });
  await assert.rejects(fx.route.ensureRouteWindow("novel-1", 2, { min: 1, target: 1, completionProfile: { targetChapterCount: 80 } }), /未补出所需的连续章节路线/);
  assert.equal(calls, 1);
  assert.deepEqual(fx.state().volumes.map(item => item.chapters.map(plan => plan.id)), [["p1"]]);
});

test("failed generation does not persist a proposed workspace or rewrite execution rows", async () => {
  const fx = fixture(workspace([volume("v1", 1, [chapter(1)])], [sheet("v1", 1)]), [1], () => { throw new Error("provider failed"); });
  await assert.rejects(fx.route.ensureRouteWindow("novel-1", 2, { min: 1, target: 1, completionProfile: { targetChapterCount: 80 } }), /provider failed/);
  assert.deepEqual(fx.executions, [{ id: "c1", order: 1 }]);
  assert.equal(fx.state().volumes[0].chapters[0].title, "Chapter 1");
});


test("a full beat with a hole cannot return an unready route window silently", async () => {
  const fx = fixture(workspace([volume("v1", 1, [chapter(1), chapter(3), chapter(4)])], [sheet("v1", 1, "1-3章")]), [1, 3, 4], () => { throw new Error("AI must not guess a reordered plan"); });
  await assert.rejects(fx.route.ensureRouteWindow("novel-1", 2, { min: 1, target: 1, completionProfile: { targetChapterCount: 4 } }), /缺少所需的连续章节路线/);
  assert.deepEqual(fx.executions.map(row => row.order), [1, 3, 4]);
});

test("different windows of one book serialize and each receives its own saved result", async () => {
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  let calls = 0, active = 0, maximum = 0;
  const fx = fixture(workspace([volume("v1", 1, [chapter(1)])], [sheet("v1", 1)]), [1], async options => {
    calls++; active++; maximum = Math.max(maximum, active);
    if (calls === 1) { entered(); await gate; }
    const next = structuredClone(options.draftWorkspace);
    next.volumes[0].chapters.push(chapter(calls + 1)); active--;
    return next;
  });
  const first = fx.route.ensureRouteWindow("novel-1", 2, { min: 1, target: 1, completionProfile: { targetChapterCount: 80 } });
  await started;
  const second = fx.route.ensureRouteWindow("novel-1", 3, { min: 1, target: 1, completionProfile: { targetChapterCount: 80 } });
  release();
  const results = await Promise.all([first, second]);
  assert.equal(maximum, 1);
  assert.equal(calls, 2);
  assert.deepEqual(results.map(result => result.availableRouteCount), [1, 1]);
  assert.deepEqual(fx.executions.map(row => row.order), [1, 2, 3]);
});
