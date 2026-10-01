const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const Database = require("better-sqlite3");

const serverRoot = path.resolve(__dirname, "..");
const projectRoot = path.dirname(serverRoot);
const fixtureRoot = path.join(serverRoot, "tests/fixtures/directorRecovery");
const scratchRoot = path.join(projectRoot, ".tmp/director-recovery");
fs.mkdirSync(scratchRoot, { recursive: true });
const outputRoot = fs.mkdtempSync(path.join(scratchRoot, "run-"));
const template = path.join(outputRoot, "schema.db");
const sqlPath = path.join(outputRoot, "schema.sql");
const fixtureEnv = {
  ...process.env,
  DATABASE_URL: "file:" + template,
  NOVELFOUNDRY_APP_DATA_DIR: outputRoot,
  NODE_ENV: "test",
  LLM_DEBUG_LOG: "false",
  CHECKPOINT_DISABLE: "1",
  PRISMA_HIDE_UPDATE_MESSAGE: "1",
};

// Diff two datamodels, never a configured datasource. Apply SQL only to a
// brand-new fixture path in the exclusively created scratch directory.
const schema = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", [
  "exec", "prisma", "migrate", "diff", "--from-empty", "--to-schema",
  path.join(serverRoot, "src/prisma/schema.sqlite.prisma"), "--script", "--output", sqlPath,
], { cwd: serverRoot, env: fixtureEnv, encoding: "utf8" });
if (schema.error || schema.status !== 0) {
  throw schema.error ?? new Error(schema.stderr || schema.stdout || "Could not generate the fixture schema.");
}
assert.equal(fs.existsSync(template), false);
const database = new Database(template);
try {
  database.exec(fs.readFileSync(sqlPath, "utf8"));
  database.pragma("journal_mode = DELETE");
  assert.equal(database.pragma("quick_check", { simple: true }), "ok");
} finally {
  database.close();
}

const results = [];
for (const file of ["directorWorker.test.js", "directorRunCommandService.test.js", "directorNodeRunner.test.js"]) {
  const directory = path.join(outputRoot, path.basename(file, ".test.js"));
  fs.mkdirSync(directory);
  const databasePath = path.join(directory, "fixture.db");
  fs.copyFileSync(template, databasePath);
  const result = spawnSync(process.execPath, [
    "--require", path.join(fixtureRoot, "denyNetwork.cjs"), "--test", path.join(serverRoot, "tests", file),
  ], {
    cwd: projectRoot,
    env: {
      ...fixtureEnv,
      DATABASE_URL: "file:" + databasePath,
      NOVELFOUNDRY_APP_DATA_DIR: directory,
      NOVELFOUNDRY_RECOVERY_SCHEMA_TEMPLATE: template,
      NOVELFOUNDRY_RECOVERY_OUTPUT_DIR: outputRoot,
      SQLITE_ENABLE_WAL: "false",
    },
    encoding: "utf8",
    timeout: 60_000,
  });
  const output = (result.stdout ?? "") + (result.stderr ?? "");
  const log = path.join(directory, "tests.log");
  fs.writeFileSync(log, output);
  const summary = {
    file, code: result.status, signal: result.signal, log,
    summary: output.split("\n").filter(line => /^# (tests|pass|fail|skipped|duration_ms)/.test(line)),
  };
  results.push(summary);
  console.log(JSON.stringify(summary));
  if (result.status !== 0) console.error(result.error?.message ?? output);
}
fs.writeFileSync(path.join(outputRoot, "results.json"), JSON.stringify(results, null, 2) + "\n");
process.exitCode = results.some(result => result.code !== 0) ? 1 : 0;
