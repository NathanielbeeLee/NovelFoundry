const assert = require("node:assert/strict");
const { prisma, taskId, createProject, buildCapabilities, readState, finish, fail } = require("./persistedProject.cjs");
const { DirectorCommandService } = require("../../../dist/services/novel/director/commands/DirectorCommandService.js");

async function main() {
  await createProject();
  const { workflow, commands } = buildCapabilities();
  const competingService = new DirectorCommandService(workflow);
  const accepted = await Promise.all(Array.from({ length: 8 }, (_, index) => (
    (index % 2 ? competingService : commands).enqueueContinueCommand(taskId, { continuationMode: "resume" })
  )));
  const afterEnqueue = await readState();
  assert.equal(new Set(accepted.map(response => response.commandId)).size, 1);
  assert.equal(afterEnqueue.commands.length, 1);
  const claims = await Promise.all([
    commands.leaseNextCommand({ workerId: "original-worker-a", leaseMs: 1000 }),
    competingService.leaseNextCommand({ workerId: "original-worker-b", leaseMs: 1000 }),
  ]);
  assert.equal(claims.filter(Boolean).length, 1, "An atomic claim permits one lease owner.");
  const original = claims.find(Boolean);
  await commands.markCommandRunning(original.id, original.leaseOwner, 1000);
  const activeAcceptance = await commands.enqueueContinueCommand(taskId);
  assert.equal(activeAcceptance.commandId, original.id);
  await prisma.directorRunCommand.update({
    where: { id: original.id },
    data: { leaseExpiresAt: new Date(Date.now() - 100) },
  });
  assert.equal(await commands.recoverStaleLeases(), 1);
  const replacement = await competingService.leaseNextCommand({ workerId: "replacement-worker", leaseMs: 1000 });
  assert.ok(replacement);
  assert.equal(replacement.id, original.id);
  assert.equal(replacement.attempt, 2);
  await competingService.markCommandRunning(replacement.id, replacement.leaseOwner, 1000);
  const replacementState = await readState();
  const rejectedOperations = [];
  assert.equal(await commands.renewLease(original.id, original.leaseOwner, 1000), false);
  rejectedOperations.push("renew");
  for (const [name, run] of [
    ["running", () => commands.markCommandRunning(original.id, original.leaseOwner, 1000)],
    ["succeeded", () => commands.markCommandSucceeded(original.id, original.leaseOwner)],
    ["failed", () => commands.markCommandFailed(original.id, original.leaseOwner, new Error("obsolete owner failed"))],
    ["cancelled", () => commands.markCommandCancelled(original.id, original.leaseOwner)],
  ]) {
    await run();
    const current = await readState();
    assert.deepEqual(current.commands, replacementState.commands, `Obsolete owner cannot mark command ${name}.`);
    assert.equal(current.task.pendingManualRecovery, false, "Obsolete failure must not pause the replacement worker.");
    assert.equal(current.task.lastError, null);
    rejectedOperations.push(name);
  }
  await competingService.markCommandSucceeded(replacement.id, replacement.leaseOwner);
  const finalState = await readState();
  assert.equal(finalState.commands[0].status, "succeeded");
  await finish({ ...finalState, accepted, claims, activeAcceptance, replacementState, rejectedOperations });
}

main().catch(fail);
