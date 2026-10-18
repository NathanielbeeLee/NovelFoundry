const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { buildContentHash } = require("../dist/services/novel/artifacts/domain/ChapterSourceIdentity.js");

function load(overrides, reload, read) {
  const loadedBefore = new Set(Object.keys(require.cache));
  const saved = new Map();
  const resolve = relative => require.resolve(path.join(__dirname, "../dist", relative));
  try {
    for (const [relative, exports] of Object.entries(overrides)) {
      const id = resolve(relative); saved.set(id, require.cache[id]);
      require.cache[id] = { id, filename: id, loaded: true, exports };
    }
    for (const relative of reload) {
      const id = resolve(relative); saved.set(id, require.cache[id]); delete require.cache[id];
    }
    return read(relative => require(resolve(relative)));
  } finally {
    for (const id of Object.keys(require.cache)) if (!loadedBefore.has(id)) delete require.cache[id];
    for (const [id, previous] of saved) {
      if (previous) require.cache[id] = previous;
      else delete require.cache[id];
    }
  }
}

const SOURCE = "services/novel/artifacts/infrastructure/ChapterSourceTransaction.js";
const DELTA = "services/novel/artifacts/application/ChapterArtifactDeltaService.js";
const INDEX = "services/novel/artifacts/infrastructure/ChapterProjectionIndexQueue.js";
const MANUAL = "services/novel/artifacts/application/ManualChapterProjectionService.js";
function fixture() {
  const state = { content: "committed A", events: [], scheduled: [], pending: null, queueFails: false, time: 1, summary: null };
  const chapter = () => ({ id: "c", novelId: "n", order: 2, title: "Chapter", content: state.content, updatedAt: new Date(state.time) });
  const db = {
    novel: { findUnique: async () => ({ title: "Novel" }) },
    chapter: { findFirst: async () => chapter(), findMany: async () => [] },
    character: { findMany: async () => [] }, payoffLedgerItem: { findMany: async () => [] },
    async $transaction(run) {
      const staged = [];
      const tx = {
        $executeRaw: async () => 1,
        chapterSummary: { findUnique: async () => state.summary },
        chapter: {
          findFirst: async () => chapter(),
          updateMany: async ({ where }) => ({ count: where.content === state.content ? 1 : 0 }),
        },
        characterTimeline: { findMany: async () => [] },
        ragIndexJob: { create: async ({ data }) => { staged.push(["index", data.ownerType, data.payload.sourceRevision]); return data; } },
      };
      state.pending = staged;
      try { const result = await run(tx); state.events.push(...staged); return result; }
      finally { state.pending = null; }
    },
  };
  const output = { syncPlan: { stateSnapshot: "skip", characterResources: "skip", payoffLedger: "skip", characterDynamics: "skip" },
    characterKnowledgeStates: [], characterMindDeltas: [], characterDialogueInfluenceResolutions: [],
    requiresFullReconcile: false };
  const record = label => async () => { assert.ok(state.pending); state.pending.push([label]); return 0; };
  const overrides = {
    "modules/novel/quality/polishPersistence.js": { polishPrisma: db },
    "db/sqliteRetry.js": { withSqliteRetry: operation => operation() },
    "prompting/core/promptRunner.js": { runStructuredPrompt: async () => { await state.beforeResult?.(); return { output }; } },
    "prompting/prompts/novel/chapterArtifactDelta.prompts.js": { chapterArtifactDeltaPrompt: {} },
    "services/state/StateService.js": { stateService: { getLatestSnapshotBeforeChapter: async () => null } },
    "services/novel/characterMind/CharacterMindService.js": { characterMindService: {} },
    "services/novel/characterResource/CharacterResourceLedgerService.js": { characterResourceLedgerService: { listResources: async () => [] } },
    "services/novel/characterResource/CharacterResourceStaleScanService.js": { characterResourceStaleScanService: { scanAfterChapter: record("stale-scan") } },
    "services/novel/state/StateCommitService.js": { stateCommitService: { proposeAndCommit: async () => ({ committed: [] }) } },
    "services/novel/artifacts/infrastructure/ChapterArtifactStore.js": { ChapterArtifactStore: class { persistChapterSummaryAndFacts = record("summary"); } },
    "services/novel/artifacts/infrastructure/ChapterCharacterArtifactStore.js": { ChapterCharacterArtifactStore: class {
      listActiveCharacterDialogueInfluences = async () => [];
      expirePastCharacterDialogueInfluences = record("expire-influence");
      persistChapterTimeline = record("timeline");
    } },
    "services/rag/index.js": { ragServices: { ragIndexService: { enqueueOwnerJob: async (_kind, ownerType, ownerId, options) => {
      if (state.queueFails) throw new Error("queue unavailable");
      return options.db.ragIndexJob.create({ data: { ownerType, ownerId, payload: options.payload } });
    } } } },
    "services/novel/runtime/ChapterArtifactBackgroundSyncService.js": { chapterArtifactBackgroundSyncService: {
      scheduleChapterSync: (...args) => state.scheduled.push(args),
    } },
  };
  const services = load(overrides, [SOURCE, INDEX, DELTA, MANUAL], get => ({
    source: get(SOURCE), delta: new (get(DELTA).ChapterArtifactDeltaService)(), manual: get(MANUAL),
  }));
  return { ...services, state, db };
}

test("late AI output from save A cannot overwrite save B projections or emit its RAG events", async () => {
  const f = fixture();
  let release; let started;
  const entered = new Promise(resolve => { started = resolve; });
  const paused = new Promise(resolve => { release = resolve; });
  f.state.beforeResult = async () => { started(); await paused; };
  const oldRun = f.delta.syncChapterArtifacts({ novelId: "n", chapterId: "c", content: "committed A" });
  await entered;
  f.state.content = "committed B";
  release();
  await assert.rejects(oldRun, f.source.StaleChapterSourceError);
  assert.deepEqual(f.state.events, []);
  f.state.beforeResult = null;
  await f.delta.syncChapterArtifacts({ novelId: "n", chapterId: "c", content: "committed B" });
  assert.deepEqual(f.state.events.map(event => event[0]), ["expire-influence", "summary", "timeline", "stale-scan", "index", "index", "index"]);
});

test("derived rows and index jobs roll back together when index outbox fails", async () => {
  const f = fixture(); f.state.queueFails = true;
  await assert.rejects(f.delta.syncChapterArtifacts({ novelId: "n", chapterId: "c", content: f.state.content }), /queue unavailable/);
  assert.deepEqual(f.state.events, []);
});

test("manual scheduling ignores stale saves, uses committed body, and never invokes AI for blank prose", async () => {
  const f = fixture();
  await f.manual.scheduleManualChapterProjections("n", "c", "obsolete body");
  assert.deepEqual(f.state.events, []); assert.deepEqual(f.state.scheduled, []);
  await f.manual.scheduleManualChapterProjections("n", "c", f.state.content);
  assert.equal(f.state.scheduled[0][2], f.state.content);
  f.state.scheduled.length = 0; f.state.content = "  ";
  await f.manual.scheduleManualChapterProjections("n", "c", "  ");
  assert.deepEqual(f.state.scheduled, []);
});

test("a failed index follow-up remains separate from AI scheduling and saved content", async t => {
  const f = fixture(); f.state.queueFails = true;
  const warnings = []; t.mock.method(console, "warn", (...args) => warnings.push(args));
  await f.manual.scheduleManualChapterProjections("n", "c", f.state.content);
  assert.equal(f.state.content, "committed A");
  assert.equal(f.state.scheduled.length, 1);
  assert.equal(warnings.length, 1);
  assert.deepEqual(f.state.events, []);
});

test("a delayed mirror is refused after a metadata revision, even with unchanged prose", async () => {
  const f = fixture();
  await assert.rejects(f.source.runWithChapterSource({ novelId: "n", chapterId: "c",
    contentHash: buildContentHash(f.state.content), expectedUpdatedAt: new Date(0) }, async () => { throw new Error("must not mirror"); }),
  f.source.StaleChapterSourceError);
  assert.deepEqual(f.state.events, []);
});

test("manual update returns its committed row after both mirror and scheduling failures", async t => {
  const row = { id: "c", novelId: "n", content: "committed row", order: 1, title: "Title", updatedAt: new Date(1) };
  let scheduledContent;
  const { NovelCoreCrudService } = load({
    "db/prisma.js": { prisma: {} },
    "services/novel/coreCrud/infrastructure/NovelListQueryService.js": { NovelListQueryService: class {} },
    "services/novel/coreCrud/infrastructure/ChapterUpdatePersistence.js": { persistChapterUpdate: async () => row },
    "services/novel/novelChapterArtifacts.js": { syncChapterArtifacts: async (_n, _c, content) => { scheduledContent = content; throw new Error("follow-up unavailable"); } },
    "services/novel/artifacts/persistence.js": { buildContentHash, runWithChapterSource: async (_source, run) => run() },
  }, ["services/novel/coreCrud/application/NovelCoreCrudService.js"], get => get("services/novel/coreCrud/application/NovelCoreCrudService.js"));
  const service = Object.create(NovelCoreCrudService.prototype);
  service.volumeService = { mirrorChapterIntoWorkspace: async () => { throw new Error("mirror unavailable"); } };
  t.mock.method(console, "warn", () => {});
  assert.equal(await service.updateChapter("n", "c", { content: "caller request", expectedContent: "old" }), row);
  assert.equal(scheduledContent, row.content);
});


test("index outbox revisions change for metadata and summary regeneration without a prose edit", async () => {
  const f = fixture();
  await f.manual.scheduleManualChapterProjections("n", "c", f.state.content);
  const first = f.state.events.find(event => event[0] === "index")[2];
  f.state.events.length = 0; f.state.time = 2;
  await f.manual.scheduleManualChapterProjections("n", "c", f.state.content);
  const metadataRevision = f.state.events.find(event => event[0] === "index")[2];
  assert.notEqual(metadataRevision, first);
  f.state.events.length = 0; f.state.summary = { summary: "new AI summary" };
  await f.manual.scheduleManualChapterProjections("n", "c", f.state.content);
  assert.notEqual(f.state.events.find(event => event[0] === "index")[2], metadataRevision);
});


test("metadata changed during AI extraction marks the existing checkpoint stale and permits a later retry", async () => {
  const f = fixture();
  const failures = []; const successes = [];
  const { ChapterArtifactBackgroundSyncService } = load({
    "services/novel/artifacts/persistence.js": f.source,
    "services/novel/artifacts/index.js": { buildContentHash, StaleChapterSourceError: f.source.StaleChapterSourceError },
  }, ["services/novel/runtime/ChapterArtifactBackgroundSyncService.js"], get => get("services/novel/runtime/ChapterArtifactBackgroundSyncService.js"));
  const background = new ChapterArtifactBackgroundSyncService();
  background.hasCompletedCheckpoint = async () => false;
  background.claimCheckpoint = async () => "claimed";
  background.runTrackedActivity = async (_novel, _context, _kind, run) => run();
  background.markCheckpointFailed = async input => failures.push(input);
  background.markCheckpoint = async input => successes.push(input);
  background.shouldRunPayoffFullReconcile = async () => false;
  background.getArtifactDeltaService = () => f.delta;
  f.state.beforeResult = async () => { f.state.time = 2; };
  await background.runChapterSyncNow("n", "c", f.state.content);
  assert.equal(failures.length, 1); assert.equal(failures[0].metadata.superseded, true);
  assert.deepEqual(successes, []); assert.deepEqual(f.state.events, []);
  f.state.beforeResult = null;
  await background.runChapterSyncNow("n", "c", f.state.content);
  assert.equal(successes.length, 1);
  assert.ok(f.state.events.some(event => event[0] === "summary"));
});
