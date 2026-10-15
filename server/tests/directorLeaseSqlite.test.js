const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");
const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
const { withExecutionWriteFence } = require("../dist/platform/db");
const { runWithCommandAuthority } = require("../dist/services/novel/director/commands/leases/infrastructure/commandWriteScope");
const { CommandLeaseAuthority } = require("../dist/services/novel/director/commands/leases/domain/CommandLeaseAuthority");

// Owned, disposable SQLite fixture only. Never imports db/prisma or connection config.
async function fixture(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "novelfoundry-lease-test-"));
  const file = path.join(directory, "fixture.sqlite");
  const sqlite = new Database(file);
  sqlite.exec(`
    CREATE TABLE DirectorRunCommand (
      id TEXT PRIMARY KEY, taskId TEXT NOT NULL, novelId TEXT, commandType TEXT NOT NULL,
      idempotencyKey TEXT NOT NULL, status TEXT NOT NULL, leaseOwner TEXT,
      leaseExpiresAt DATETIME, attempt INTEGER NOT NULL, runAfter DATETIME NOT NULL,
      payloadJson TEXT, errorMessage TEXT, startedAt DATETIME, finishedAt DATETIME,
      createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL
    );
    CREATE TABLE AppSetting (
      key TEXT PRIMARY KEY, value TEXT NOT NULL, createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL
    );
  `);
  sqlite.close();
  const raw = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${file}`, timeout: 150 }) });
  const authorities = [];
  const authority = (owner = "owner-a", attempt = 1) => {
    const value = new CommandLeaseAuthority({ commandId: "command", owner, attempt }, Date.now() + 60000);
    authorities.push(value); return value;
  };
  try {
    // Bind Dates through the actual adapter, with the same default timestamp format as db/prisma.
    const now = new Date(); const expiry = new Date(Date.now() + 60000);
    await raw.$executeRaw`INSERT INTO DirectorRunCommand
      (id,taskId,commandType,idempotencyKey,status,leaseOwner,leaseExpiresAt,attempt,runAfter,createdAt,updatedAt)
      VALUES ('command','fixture-task','run','fixture','running','owner-a',${expiry},1,${now},${now},${now})`;
    await raw.appSetting.create({ data: { key: "prose", value: "original" } });
    await run({ raw, db: withExecutionWriteFence(raw), file, authority });
  } finally {
    for (const item of authorities) item.revoke();
    await raw.$disconnect();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

const prose = (raw) => raw.appSetting.findUniqueOrThrow({ where: { key: "prose" } });
const write = (db, value) => db.appSetting.update({ where: { key: "prose" }, data: { value } });
const lost = (error) => error?.code === "DIRECTOR_COMMAND_LEASE_LOST";

test("real SQLite: valid owner commits and out-of-scope delegate behavior is preserved", () => fixture(async ({ raw, db, authority }) => {
  assert.equal(db.appSetting, raw.appSetting);
  await runWithCommandAuthority(authority(), () => write(db, "authorized"));
  assert.equal((await prose(raw)).value, "authorized");
  await write(db, "unscoped manual write");
  assert.equal((await prose(raw)).value, "unscoped manual write");
}));

test("real SQLite: changed durable owner/attempt fences live stale authority and permits new owner", () => fixture(async ({ raw, db, authority }) => {
  const old = authority();
  await raw.directorRunCommand.updateMany({ where: { id: "command" }, data: { leaseOwner: "owner-b", attempt: 2 } });
  assert.equal(old.signal.aborted, false);
  await assert.rejects(runWithCommandAuthority(old, () => write(db, "late old result")), lost);
  assert.equal((await prose(raw)).value, "original");
  assert.equal(old.signal.aborted, true);
  await runWithCommandAuthority(authority("owner-b", 2), () => write(db, "new owner result"));
  assert.equal((await prose(raw)).value, "new owner result");
}));

test("real SQLite: callback and array transactions roll back writes on failure", () => fixture(async ({ raw, db, authority }) => {
  await assert.rejects(runWithCommandAuthority(authority(), () => db.$transaction(async (tx) => {
    await write(tx, "must roll back");
    // Nested shared-facade mutation must join the callback transaction.
    await db.appSetting.create({ data: { key: "nested", value: "must roll back" } });
    throw new Error("abort callback");
  })), /abort callback/);
  assert.equal((await prose(raw)).value, "original");
  assert.equal(await raw.appSetting.count({ where: { key: "nested" } }), 0);
  await assert.rejects(runWithCommandAuthority(authority(), () => db.$transaction([
    write(db, "array must roll back"),
    db.appSetting.create({ data: { key: "prose", value: "duplicate key" } }),
  ])));
  assert.equal((await prose(raw)).value, "original");
}));

test("real SQLite: revoked late result and escaped closed transaction cannot commit", () => fixture(async ({ raw, db, authority }) => {
  const owner = authority();
  let complete;
  const result = new Promise((resolve) => { complete = resolve; });
  const pending = runWithCommandAuthority(owner, async () => {
    const value = await result;
    await write(db, value);
  });
  owner.revoke(); complete("late provider output");
  await assert.rejects(pending, lost);
  assert.equal((await prose(raw)).value, "original");
  let escaped;
  await runWithCommandAuthority(authority(), () => db.$transaction(async (tx) => { escaped = tx; }));
  await assert.rejects(write(escaped, "closed tx output"), /already closed/);
  assert.equal((await prose(raw)).value, "original");
}));

test("real SQLite: claim write lock prevents a second connection from stealing ownership before commit", () => fixture(async ({ raw, db, file, authority }) => {
  let competingError;
  await runWithCommandAuthority(authority(), () => db.$transaction(async (tx) => {
    const competing = new Database(file, { timeout: 20 });
    try {
      competing.prepare("UPDATE DirectorRunCommand SET leaseOwner = ?, attempt = 2 WHERE id = ?")
        .run("owner-b", "command");
    } catch (error) { competingError = error; }
    finally { competing.close(); }
    await write(tx, "locked owner result");
  }));
  assert.equal(competingError?.code, "SQLITE_BUSY");
  assert.equal((await prose(raw)).value, "locked owner result");
  // Once committed, another owner may claim and the old generation is fenced.
  await raw.directorRunCommand.updateMany({ where: { id: "command" }, data: { leaseOwner: "owner-b", attempt: 2 } });
  await assert.rejects(runWithCommandAuthority(authority(), () => write(db, "post-commit old result")), lost);
  await runWithCommandAuthority(authority("owner-b", 2), () => write(db, "new generation"));
  assert.equal((await prose(raw)).value, "new generation");
}));

test("real SQLite: each durable ownership predicate independently rejects a still-live authority", async () => {
  for (const data of [
    { leaseOwner: "different-owner" },
    { attempt: 2 },
    { status: "cancelled" },
    { leaseExpiresAt: new Date(0) },
  ]) {
    await fixture(async ({ raw, db, authority }) => {
      const owner = authority();
      await raw.directorRunCommand.updateMany({ where: { id: "command" }, data });
      assert.equal(owner.signal.aborted, false);
      await assert.rejects(runWithCommandAuthority(owner, () => write(db, "rejected")), lost);
      assert.equal((await prose(raw)).value, "original");
    });
  }
});

test("real SQLite: revocation before callback completion rolls back generated and raw writes", () => fixture(async ({ raw, db, authority }) => {
  const owner = authority();
  await assert.rejects(runWithCommandAuthority(owner, () => db.$transaction(async (tx) => {
    await write(tx, "generated pending");
    await db.$executeRaw`UPDATE AppSetting SET value = ${"raw pending"} WHERE key = 'prose'`;
    owner.revoke();
  })), lost);
  assert.equal((await prose(raw)).value, "original");
}));

test("real SQLite: raw query APIs that mutate also acquire the durable fence", () => fixture(async ({ raw, db, authority }) => {
  await runWithCommandAuthority(authority(), () => db.$queryRaw`UPDATE AppSetting SET value = ${"valid raw"} WHERE key = 'prose' RETURNING value`);
  assert.equal((await prose(raw)).value, "valid raw");
  const stale = authority();
  await raw.directorRunCommand.updateMany({ where: { id: "command" }, data: { attempt: 2 } });
  await assert.rejects(runWithCommandAuthority(stale, () => db.$queryRaw`UPDATE AppSetting SET value = ${"stale raw"} WHERE key = 'prose' RETURNING value`), lost);
  assert.equal((await prose(raw)).value, "valid raw");
}));
