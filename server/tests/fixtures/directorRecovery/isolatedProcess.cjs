const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { fork } = require("node:child_process");
const Database = require("better-sqlite3");

const projectRoot = path.resolve(__dirname, "../../../..");
const outputRoot = path.resolve(process.env.NOVELFOUNDRY_RECOVERY_OUTPUT_DIR ?? path.join(projectRoot, ".tmp/director-recovery"));
assert.ok(outputRoot.startsWith(path.join(projectRoot, ".tmp") + path.sep), "Recovery fixture output must stay inside the project scratch directory.");

function hasFixtureEnvironment() {
  return Boolean(process.env.NOVELFOUNDRY_RECOVERY_SCHEMA_TEMPLATE);
}

function createScenarioFolder(name) {
  const template = process.env.NOVELFOUNDRY_RECOVERY_SCHEMA_TEMPLATE;
  assert.ok(template && path.isAbsolute(template), "Set an absolute NOVELFOUNDRY_RECOVERY_SCHEMA_TEMPLATE pointing at an empty schema fixture.");
  const database = new Database(template, { readonly: true, fileMustExist: true });
  try {
    for (const table of ["Novel", "Chapter", "NovelWorkflowTask", "DirectorRunCommand", "DirectorRun", "DirectorStepRun", "DirectorArtifact", "DirectorEvent"]) {
      assert.equal(database.prepare(`SELECT COUNT(*) AS count FROM "${table}"`).get().count, 0, `Schema fixture must contain no ${table} data.`);
    }
  } finally {
    database.close();
  }
  fs.mkdirSync(outputRoot, { recursive: true });
  return { folder: fs.mkdtempSync(path.join(outputRoot, name + "-")), template };
}

function copyDatabase(source, folder, name) {
  const directory = path.join(folder, name);
  fs.mkdirSync(directory, { recursive: true });
  const target = path.join(directory, "fixture.db");
  assert.notEqual(source, target);
  fs.copyFileSync(source, target);
  // A SIGKILL may leave a rollback journal; recover it only on the copied path.
  assert.ok(!fs.existsSync(source + "-wal"), "Recovery fixtures must not omit a live WAL snapshot.");
  if (fs.existsSync(source + "-journal")) {
    fs.copyFileSync(source + "-journal", target + "-journal");
  }
  const database = new Database(target, { fileMustExist: true });
  try {
    // Use a self-contained snapshot so a killed process has no omitted WAL.
    database.pragma("journal_mode = DELETE");
    assert.equal(database.pragma("quick_check", { simple: true }), "ok");
  } finally {
    database.close();
  }
  return target;
}

async function runFixture(entry, mode, database, { crashAtReady = false } = {}) {
  const dataDirectory = path.dirname(database);
  let output = "";
  let report;
  let fixtureError;
  let failureState;
  const child = fork(path.join(__dirname, entry), [mode], {
    cwd: path.join(projectRoot, "server"),
    execArgv: ["--require", path.join(__dirname, "denyNetwork.cjs")],
    env: {
      ...process.env,
      DATABASE_URL: "file:" + database,
      NOVELFOUNDRY_APP_DATA_DIR: dataDirectory,
      NOVELFOUNDRY_RECOVERY_OUTPUT_DIR: outputRoot,
      NODE_ENV: "test",
      LLM_DEBUG_LOG: "false",
      SQLITE_ENABLE_WAL: "false",
      DIRECTOR_WORKER_LEASE_MS: "300",
      DIRECTOR_WORKER_STALE_SCAN_MS: "1",
      DIRECTOR_WORKER_STALE_AUTO_RECOVERY_MAX_ATTEMPTS: "2",
      DIRECTOR_WORKER_FULL_BOOK_STALE_AUTO_RECOVERY_MAX_ATTEMPTS: "5",
    },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  child.stdout.on("data", data => output += data);
  child.stderr.on("data", data => output += data);
  child.on("message", message => {
    if (message.type === "error") {
      fixtureError = message.error;
      failureState = message.state;
    }
    if (message.type === "ready" || message.type === "result") {
      report = message.result;
      if (message.type === "ready" && crashAtReady) child.kill("SIGKILL");
    }
  });
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Director fixture ${entry}:${mode} exceeded 20 seconds.`));
    }, 20_000);
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("exit", (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
  });
  fs.writeFileSync(path.join(dataDirectory, "process.log"), output);
  fs.writeFileSync(path.join(dataDirectory, "process-result.json"), JSON.stringify({ ...result, report, error: fixtureError, failureState, database }, null, 2) + "\n");
  if (fixtureError) throw new Error(fixtureError);
  if (crashAtReady) assert.equal(result.signal, "SIGKILL", output);
  else assert.equal(result.code, 0, output);
  assert.ok(report, `Missing report from ${entry}:${mode}: ${output}`);
  return report;
}

async function runIsolatedScenario(entry, mode) {
  const { folder, template } = createScenarioFolder(mode);
  const database = copyDatabase(template, folder, "process");
  const report = await runFixture(entry, mode, database);
  fs.writeFileSync(path.join(folder, "scenario.json"), JSON.stringify({ report, database }, null, 2) + "\n");
  return report;
}

async function runWorkerRestartScenario(mode) {
  const { folder, template } = createScenarioFolder(mode);
  const crashedDatabase = copyDatabase(template, folder, "before-crash");
  const before = await runFixture("workerRestart.cjs", "crash", crashedDatabase, { crashAtReady: true });
  const snapshotHash = crypto.createHash("sha256").update(fs.readFileSync(crashedDatabase)).digest("hex");
  const resumedDatabase = copyDatabase(crashedDatabase, folder, "after-restart");
  const after = await runFixture("workerRestart.cjs", mode, resumedDatabase);
  assert.notEqual(before.pid, after.pid);
  assert.equal(crypto.createHash("sha256").update(fs.readFileSync(crashedDatabase)).digest("hex"), snapshotHash, "Recovery must not write to the preserved crash snapshot.");
  fs.writeFileSync(path.join(folder, "scenario.json"), JSON.stringify({ before, after, snapshotHash, crashedDatabase, resumedDatabase }, null, 2) + "\n");
  return { before, after };
}

module.exports = { hasFixtureEnvironment, runIsolatedScenario, runWorkerRestartScenario };
