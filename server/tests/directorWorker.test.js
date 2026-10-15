const test = require("node:test");
const assert = require("node:assert/strict");

const { prisma } = require("../dist/db/prisma.js");
const { DirectorWorker } = require("../dist/workers/directorWorker.js");
const { DirectorTaskQueue } = require("../dist/workers/DirectorTaskQueue.js");
const { CommandLeaseAuthority } = require("../dist/services/novel/director/commands/leases/index.js");
const { taskDispatcher } = require("../dist/workers/TaskDispatcher.js");
const { hasFixtureEnvironment, runWorkerRestartScenario } = require("./fixtures/directorRecovery/isolatedProcess.cjs");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("director worker renews a leased command while waiting for resource budget", async () => {
  const events = [];
  let leaseReturned = false;
  const command = {
    id: "command-1",
    taskId: "task-1",
    novelId: "novel-1",
    commandType: "continue",
  };

  const queue = Object.create(DirectorTaskQueue.prototype);
  queue.workerId = "test-worker";
  queue.leaseMs = 300;
  queue.staleScanMs = Number.MAX_SAFE_INTEGER;
  queue.executionSlots = 1;
  queue.pollMs = 1;

  queue.leaseNext = async () => {
    if (leaseReturned) return null;
    leaseReturned = true;
    events.push("lease");
    return { command };
  };
  queue.startLeaseRenewal = (command, slotId) => {
    const commandId = command.id;
    events.push(`start-renewal:${commandId}:${slotId}`);
    const authority = new CommandLeaseAuthority({ commandId, owner: `test-worker:${slotId}`, attempt: 1 }, Date.now() + 1000);
    return { authority, stop: () => {
      authority.revoke();
      events.push("stop-renewal");
    } };
  };
  queue.acquireResourceGate = async (novelId, commandType) => {
    events.push(`acquire-gate:${novelId}:${commandType}`);
    await delay(150);
    events.push("gate-acquired");
  };
  queue.releaseResourceGate = (novelId, commandType) => {
    events.push(`release-gate:${novelId}:${commandType}`);
  };
  queue.markRunning = async (commandId, slotId) => {
    events.push(`mark-running:${commandId}:${slotId}`);
  };
  queue.completeTask = async (commandId, slotId) => {
    events.push(`complete:${commandId}:${slotId}`);
  };
  queue.cancelTask = async () => {
    events.push("cancel");
  };
  queue.failTask = async () => {
    events.push("fail");
  };
  queue.waitForWork = async () => {
    await delay(1);
  };

  const commandExecutor = {
    execute: async (commandId) => {
      events.push(`execute:${commandId}`);
      return "completed";
    },
  };

  const worker = new DirectorWorker({ queue, commandExecutor });
  const didWork = await worker.tick("slot-1");

  assert.equal(didWork, true);
  assert.ok(events.includes("lease"), "should lease a task");
  assert.ok(
    events.includes("start-renewal:command-1:slot-1"),
    "should start lease renewal with the leased command id",
  );
  assert.ok(
    events.includes("acquire-gate:novel-1:continue"),
    "should acquire per-novel resource gate using the command type",
  );
  assert.ok(
    events.includes("mark-running:command-1:slot-1"),
    "should mark the leased command as running",
  );
  assert.ok(events.includes("execute:command-1"), "should execute the leased command");
  assert.ok(
    events.includes("complete:command-1:slot-1"),
    "should complete the leased command",
  );
  assert.ok(
    events.includes("release-gate:novel-1:continue"),
    "should release per-novel resource gate",
  );
  assert.ok(events.includes("stop-renewal"), "should stop lease renewal");
  assert.ok(
    events.indexOf("start-renewal:command-1:slot-1") < events.indexOf("acquire-gate:novel-1:continue"),
    "renewal should start before waiting for resource gate",
  );
});

test("director task queue uses the guarded command lease owner", async (t) => {
  const originals = {
    findFirst: prisma.directorRunCommand.findFirst,
    updateMany: prisma.directorRunCommand.updateMany,
    findUnique: prisma.directorRunCommand.findUnique,
  };
  const calls = [];
  const leasedCommand = {
    id: "command-queued-1",
    taskId: "task-1",
    novelId: "novel-1",
    commandType: "continue",
    status: "leased",
  };

  prisma.directorRunCommand.findFirst = async (args) => {
    calls.push(["findFirst", args]);
    return {
      id: "command-queued-1",
      taskId: "task-1",
      novelId: "novel-1",
      commandType: "continue",
      status: "queued",
      attempt: 0,
      runAfter: new Date("2026-05-06T00:00:00.000Z"),
      createdAt: new Date("2026-05-06T00:00:00.000Z"),
    };
  };
  prisma.directorRunCommand.updateMany = async (args) => {
    calls.push(["updateMany", args]);
    return { count: 1 };
  };
  prisma.directorRunCommand.findUnique = async (args) => {
    calls.push(["findUnique", args]);
    assert.equal(args.where.id, "command-queued-1");
    return leasedCommand;
  };
  t.after(() => {
    prisma.directorRunCommand.findFirst = originals.findFirst;
    prisma.directorRunCommand.updateMany = originals.updateMany;
    prisma.directorRunCommand.findUnique = originals.findUnique;
  });

  const queue = new DirectorTaskQueue(
    {
      workerId: "worker-a",
      leaseMs: 1234,
      staleScanMs: Number.MAX_SAFE_INTEGER,
    },
    {
      renewLease: async () => true,
      markCommandRunning: async () => {},
      markCommandSucceeded: async () => {},
      markCommandCancelled: async () => {},
      markCommandFailed: async () => {},
      recoverStaleLeases: async () => 0,
      leaseNextCommand: (input) => new (require("../dist/services/novel/director/commands/DirectorCommandService.js").DirectorCommandService)().leaseNextCommand(input),
      getCommandById: async () => leasedCommand,
    },
  );

  const leased = await queue.leaseNext("slot-1");

  assert.ok(leased, "should return a leased command");
  assert.equal(leased.command.id, leasedCommand.id);
  assert.equal(leased.command.attempt, 1);
  assert.equal(leased.command.leaseOwner, "worker-a:slot-1");
  assert.equal(calls[0][0], "findFirst");
  assert.equal(calls[1][0], "updateMany");
  assert.equal(calls.length, 2, "claim receipt must not reread a possibly stolen generation");
  assert.equal(calls[1][1].where.attempt, 0);
  assert.equal(calls[1][1].data.status, "leased");
  assert.deepEqual(calls[0][1].where.task, { pendingManualRecovery: false });
  assert.deepEqual(calls[1][1].where.task, { pendingManualRecovery: false });
  assert.equal(calls[1][1].data.leaseOwner, "worker-a:slot-1");
  assert.equal(calls[1][1].where.id, "command-queued-1");
});

test("task dispatcher notifies waiting slots immediately", async () => {
  const start = Date.now();
  const waitPromise = taskDispatcher.waitForSignal(5000);
  await delay(10);
  taskDispatcher.notify({ commandType: "continue" });
  const wasSignaled = await waitPromise;
  const elapsed = Date.now() - start;
  assert.equal(wasSignaled, true, "should be woken by signal");
  assert.ok(elapsed < 1000, `should wake quickly, took ${elapsed}ms`);
});

test("task dispatcher returns false on timeout", async () => {
  const wasSignaled = await taskDispatcher.waitForSignal(50);
  assert.equal(wasSignaled, false, "should return false on timeout");
});

test("standalone director worker resumes a killed process from persisted chapter progress", {
  skip: !hasFixtureEnvironment(),
  timeout: 50_000,
}, async () => {
  const { before, after } = await runWorkerRestartScenario("standalone-restart");
  assert.notEqual(before.pid, after.pid);
  assert.deepEqual(before.steps.map(step => step.status), ["succeeded", "running"]);
  assert.equal(before.chapters[1].content, "");
  assert.deepEqual(after.executedChapterIds, [after.chapters[1].id]);
  assert.equal(after.chapters[0].content, before.chapters[0].content);
  assert.equal(after.steps[0].id, before.steps[0].id);
  assert.equal(after.steps[0].finishedAt, before.steps[0].finishedAt);
  assert.equal(after.commands[0].id, before.commands[0].id);
  assert.equal(after.commands[0].attempt, 2);
  assert.equal(after.commands[0].status, "succeeded");
  assert.equal(after.artifacts.length, 2);
});

test("application restart waits for explicit recovery and preserves saved chapters", {
  skip: !hasFixtureEnvironment(),
  timeout: 50_000,
}, async () => {
  const { before, after } = await runWorkerRestartScenario("application-restart");
  assert.notEqual(before.pid, after.pid);
  assert.equal(after.blockedState.task.pendingManualRecovery, true);
  assert.equal(after.blockedState.commands[0].status, "stale");
  assert.equal(after.blockedState.steps[1].status, "failed");
  assert.equal(after.blockedState.chapters[0].content, before.chapters[0].content);
  assert.equal(after.blockedState.chapters[1].content, "");
  assert.equal(after.task.pendingManualRecovery, false);
  assert.equal(after.commands[1].id, after.recoveryAcceptance.commandId);
  assert.equal(after.commands[1].status, "succeeded");
  assert.deepEqual(after.executedChapterIds, [after.chapters[1].id]);
  assert.deepEqual(after.artifacts[0], before.artifacts[0]);
});

test("lease loss cancels a resource waiter without starting or failing its command", async () => {
  const events = [];
  const command = { id: "lost", taskId: "task", novelId: "novel", commandType: "continue", attempt: 1,
    leaseOwner: "worker:slot-1", leaseExpiresAt: new Date(Date.now() + 30000) };
  const queue = new DirectorTaskQueue({ workerId: "worker", leaseMs: 30000, staleScanMs: Number.MAX_SAFE_INTEGER }, {
    recoverStaleLeases: async () => 0, leaseNextCommand: async () => command,
    renewLease: async () => false, markCommandRunning: async () => events.push("started"),
    markCommandFailed: async () => events.push("failed"), markCommandSucceeded: async () => events.push("completed"),
  });
  await queue.acquireResourceGate("novel", "continue");
  await queue.acquireResourceGate("novel", "continue");
  const worker = new DirectorWorker({ queue, commandExecutor: { execute: async () => { events.push("execute"); return "completed"; } } });
  await worker.tick("slot-1");
  assert.deepEqual(events, []);
  queue.releaseResourceGate("novel", "continue");
  // The cancelled waiter must not consume this newly available slot.
  await queue.acquireResourceGate("novel", "continue", AbortSignal.timeout(100));
  queue.releaseResourceGate("novel", "continue");
  queue.releaseResourceGate("novel", "continue");
});

test("renewal exceptions retain the deadline and late success cannot resurrect ownership", async () => {
  for (const lateSuccess of [false, true]) {
    const command = { id: "lost", attempt: 2, leaseOwner: "worker:slot-1", leaseExpiresAt: new Date(Date.now() + 30) };
    const queue = new DirectorTaskQueue({ workerId: "worker", leaseMs: 60 }, {
      renewLease: async () => { await delay(55); if (lateSuccess) return true; throw new Error("offline"); },
    });
    const { authority, stop } = queue.startLeaseRenewal(command, "slot-1");
    await delay(40);
    assert.equal(authority.signal.aborted, true);
    await delay(30);
    assert.throws(() => authority.assertLive(), /执行权/);
    stop();
  }
});

test("executor retains ownership through scheduled pipeline work and observes its final cancellation", async () => {
  const { DirectorCommandExecutor } = require("../dist/services/novel/director/commands/DirectorCommandExecutor.js");
  const { scheduleExecutionWork } = require("../dist/platform/db/index.js");
  const authority = new CommandLeaseAuthority({ commandId: "cmd", owner: "worker", attempt: 1 }, Date.now() + 30000);
  let backgroundFinished = false;
  let status = "running";
  const executor = Object.create(DirectorCommandExecutor.prototype);
  executor.commandService = {
    getCommandById: async () => ({ id: "cmd", taskId: "task", leaseOwner: "worker", attempt: 1, status: "running", leaseExpiresAt: new Date(Date.now() + 30000) }),
    parseCommandPayload: () => ({}),
  };
  executor.workflowService = { getTaskByIdWithoutHealing: async () => ({ status }) };
  executor.dispatch = async () => {
    scheduleExecutionWork(async () => { await delay(15); backgroundFinished = true; status = "cancelled"; });
    return "completed";
  };
  try {
    assert.equal(await executor.execute("cmd", authority), "cancelled");
    assert.equal(backgroundFinished, true);
  } finally { authority.revoke(); }
});
