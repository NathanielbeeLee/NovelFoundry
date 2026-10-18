const test = require("node:test");
const assert = require("node:assert/strict");
const { deleteEmptyManualChapter } = require("../dist/services/novel/coreCrud/infrastructure/ChapterDeletePersistence.js");

function fixture() {
  const state = { row: { id: "c", novelId: "n", content: "", generationState: "planned", chapterStatus: "unplanned" }, jobs: [] };
  let pending = Promise.resolve();
  const db = { $transaction(run) {
    const next = pending.then(async () => {
      await state.beforeBegin?.();
      const before = structuredClone(state.row); const jobsBefore = [...state.jobs];
      const tx = {
        $executeRaw: async (_sql, id, novelId) => state.row?.id === id && state.row?.novelId === novelId ? 1 : 0,
        chapter: {
          findFirst: async ({ where }) => state.row?.id === where.id && state.row?.novelId === where.novelId ? { ...state.row } : null,
          deleteMany: async ({ where }) => { if (state.row?.id !== where.id || state.row?.novelId !== where.novelId) return { count: 0 }; state.row = null; return { count: 1 }; },
          updateMany: async ({ data }) => { if (!state.row) return { count: 0 }; Object.assign(state.row, data); return { count: 1 }; },
        },
      };
      try { return await run(tx); }
      catch (error) { state.row = before; state.jobs = jobsBefore; throw error; }
    });
    pending = next.catch(() => {}); return next;
  } };
  return { state, db };
}

test("a save committed before the removal lock protects the no-longer-empty chapter", async () => {
  const { db, state } = fixture();
  let release; let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  state.beforeBegin = async () => { entered(); await gate; };
  const removal = deleteEmptyManualChapter(db, "n", "c", async () => state.jobs.push("delete"));
  await started;
  state.row.content = "concurrently saved prose";
  release();
  await assert.rejects(removal, { statusCode: 409 });
  assert.equal(state.row.content, "concurrently saved prose");
  assert.deepEqual(state.jobs, []);
});

test("empty removal holds its lock through outbox insertion; a later save cannot recreate deleted prose", async () => {
  const { db, state } = fixture();
  let release; let queued;
  const entered = new Promise(resolve => { queued = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const removal = deleteEmptyManualChapter(db, "n", "c", async () => {
    assert.equal(state.row, null); state.jobs.push("chapter-delete", "summary-delete"); queued(); await gate;
  });
  await entered;
  const competingSave = db.$transaction(tx => tx.chapter.updateMany({ data: { content: "late prose" } }));
  release(); await removal;
  assert.equal((await competingSave).count, 0);
  assert.equal(state.row, null);
  assert.deepEqual(state.jobs, ["chapter-delete", "summary-delete"]);
});

test("failed index outbox rolls back removal, and wrong-novel removal emits no jobs", async () => {
  const { db, state } = fixture();
  await assert.rejects(deleteEmptyManualChapter(db, "n", "c", async () => { state.jobs.push("first-delete"); throw new Error("outbox unavailable"); }), /outbox unavailable/);
  assert.equal(state.row.content, ""); assert.deepEqual(state.jobs, []);
  await assert.rejects(deleteEmptyManualChapter(db, "other", "c", async () => state.jobs.push("wrong")), { statusCode: 404 });
  assert.ok(state.row); assert.deepEqual(state.jobs, []);
});
