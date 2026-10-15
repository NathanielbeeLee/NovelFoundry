const test = require("node:test");
const assert = require("node:assert/strict");
const {
  withExecutionWriteFence, runWithExecutionWriteScope, scheduleExecutionWork,
  drainExecutionWork, afterExecutionCommit, executionSignal,
} = require("../dist/platform/db/index.js");
const { CommandLeaseAuthority } = require("../dist/services/novel/director/commands/leases/domain/CommandLeaseAuthority.js");
const { runWithCommandAuthority } = require("../dist/services/novel/director/commands/leases/infrastructure/commandWriteScope.js");

const identity = { commandId: "command", owner: "same-worker:slot-1", attempt: 1 };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function fixture() {
  let state = { attempt: 1, owner: identity.owner, status: "running", expires: Date.now() + 60000, prose: "saved prose", results: [] };
  let transactionCount = 0;
  let tail = Promise.resolve();
  const events = [];
  function client(read, transactional) {
    return {
      directorRunCommand: {
        async updateMany({ where, data }) {
          const s = read();
          if (where.id !== identity.commandId || where.attempt !== s.attempt || where.leaseOwner !== s.owner
            || !where.status.in.includes(s.status) || !(s.expires > Number(where.leaseExpiresAt.gt))) return { count: 0 };
          events.push(transactional ? "lock" : "unfenced");
          if (data.status) s.status = data.status;
          return { count: 1 };
        },
      },
      chapter: {
        async update({ data }) { events.push(transactional ? "write" : "unfenced"); read().prose = data.prose; return data; },
        async findUnique() { return { prose: read().prose }; },
      },
    };
  }
  const raw = client(() => state, false);
  raw.$transaction = async (run) => {
    let unlock;
    const previous = tail;
    tail = new Promise((resolve) => { unlock = resolve; });
    await previous;
    transactionCount++;
    const snapshot = structuredClone(state);
    const tx = client(() => snapshot, true);
    try { const result = await run(tx); state = snapshot; events.push("commit"); return result; }
    finally { unlock(); }
  };
  return {
    raw, db: withExecutionWriteFence(raw), events,
    get state() { return state; }, get transactionCount() { return transactionCount; },
    reclaim() { state.attempt++; state.owner = identity.owner; state.status = "running"; },
  };
}
function authority(attempt = 1) { return new CommandLeaseAuthority({ ...identity, attempt }, Date.now() + 60000); }

test("unscoped delegates retain native lazy promises", async () => {
  let writes = 0;
  const native = { then(resolve) { writes++; resolve("done"); } };
  const raw = { chapter: { update: () => native } };
  const db = withExecutionWriteFence(raw);
  assert.equal(db.chapter, raw.chapter);
  assert.equal(db.chapter.update({}), native);
  assert.equal(writes, 0);
  assert.equal(await db.chapter.update({}), "done");
});

test("same-owner ABA cannot save, complete, or overwrite a successor result", async () => {
  const f = fixture(); const old = authority();
  await runWithCommandAuthority(old, () => f.db.chapter.update({ data: { prose: "legitimate saved chapter" } }));
  f.reclaim();
  await assert.rejects(runWithCommandAuthority(old, () => f.db.chapter.update({ data: { prose: "late old result" } })), /执行权/);
  assert.equal(f.state.prose, "legitimate saved chapter");
  assert.equal(old.signal.aborted, true);
  const fresh = authority(2);
  await runWithCommandAuthority(fresh, () => f.db.chapter.update({ data: { prose: "successor result" } }));
  assert.equal(f.state.prose, "successor result");
  fresh.revoke(); old.revoke();
});

test("callback transactions join nested facade writes and roll back on lease loss", async () => {
  const f = fixture(); const a = authority(); let notified = 0;
  await assert.rejects(runWithCommandAuthority(a, () => f.db.$transaction(async (tx) => {
    await tx.chapter.update({ data: { prose: "uncommitted" } });
    await f.db.chapter.update({ data: { prose: "also uncommitted" } });
    afterExecutionCommit(async () => { notified++; });
    a.revoke();
  })), /执行权/);
  assert.equal(f.transactionCount, 1);
  assert.equal(f.state.prose, "saved prose");
  assert.equal(notified, 0);
  assert.deepEqual(f.events, ["lock", "write", "write"]);
});

test("array transaction stays lazy, uses one fence, and rejects foreign operations", async () => {
  const f = fixture(); const a = authority();
  await runWithCommandAuthority(a, async () => {
    const first = f.db.chapter.update({ data: { prose: "one" } });
    const second = f.db.chapter.update({ data: { prose: "two" } });
    assert.equal(f.transactionCount, 0);
    await f.db.$transaction([first, second]);
    assert.equal(f.transactionCount, 1);
    assert.equal(f.state.prose, "two");
    await assert.rejects(f.db.$transaction([Promise.resolve("foreign")]), /scoped Prisma facade/);
  });
  assert.equal(f.state.prose, "two"); a.revoke();
});

test("transaction descendants cannot reuse a closed client; notification runs only after commit", async () => {
  const f = fixture(); const a = authority(); let late; let notified = false;
  await runWithCommandAuthority(a, () => f.db.$transaction(async (tx) => {
    late = tx.chapter.update({ data: { prose: "detached" } });
    await f.db.chapter.update({ data: { prose: "committed" } });
    afterExecutionCommit(async () => { assert.equal(f.state.prose, "committed"); notified = true; });
  }));
  assert.equal(notified, true);
  await assert.rejects(Promise.resolve(late), /already closed/);
  assert.equal(f.state.prose, "committed"); a.revoke();
});

test("scheduled descendants keep command ownership until all nested work finishes", async () => {
  const f = fixture(); const a = authority();
  await runWithCommandAuthority(a, async () => {
    assert.equal(scheduleExecutionWork(async () => {
      await delay(10);
      await f.db.chapter.update({ data: { prose: "background" } });
      scheduleExecutionWork(() => f.db.chapter.update({ data: { prose: "nested background" } }));
    }), true);
    await drainExecutionWork();
  });
  assert.equal(f.state.prose, "nested background"); a.revoke();
});

test("late async writes after scope exit retain their revoked authority", async () => {
  const f = fixture(); const a = authority(); let release; let late;
  const gate = new Promise((resolve) => { release = resolve; });
  runWithCommandAuthority(a, () => { late = gate.then(() => f.db.chapter.update({ data: { prose: "late" } })); });
  a.revoke(); release();
  await assert.rejects(late, /执行权/);
  assert.equal(f.state.prose, "saved prose");
});

test("last confirmed deadline expires permanently and merges caller cancellation", async () => {
  const a = new CommandLeaseAuthority(identity, Date.now() + 20);
  const caller = new AbortController();
  const signal = runWithExecutionWriteScope({ signal: a.signal, assertLive: () => a.assertLive(), lock: async () => {} }, () => executionSignal(caller.signal));
  await delay(35);
  assert.equal(signal.aborted, true);
  assert.throws(() => a.confirmRenewal(Date.now() + 60000), /执行权/);
});

test("background failure is observed even if it rejects before dispatch drains", async () => {
  const a = authority();
  await assert.rejects(runWithCommandAuthority(a, async () => {
    scheduleExecutionWork(async () => { throw new Error("background failed"); });
    await delay(15);
    await drainExecutionWork();
  }), /background failed/);
  a.revoke();
});

test("ordinary transaction failure rolls back and discards notifications", async () => {
  const f = fixture(); const a = authority(); let notified = false;
  await assert.rejects(runWithCommandAuthority(a, () => f.db.$transaction(async (tx) => {
    await tx.chapter.update({ data: { prose: "partial" } });
    afterExecutionCommit(async () => { notified = true; });
    throw new Error("write failed");
  })), /write failed/);
  assert.equal(f.state.prose, "saved prose");
  assert.equal(notified, false); a.revoke();
});

test("a non-cooperative provider releases its waiting worker on authority loss", async () => {
  const a = authority(); let release;
  const provider = new Promise((resolve) => { release = resolve; });
  const waiting = a.wait(provider);
  a.revoke();
  await assert.rejects(waiting, /执行权/);
  release("late result");
});
