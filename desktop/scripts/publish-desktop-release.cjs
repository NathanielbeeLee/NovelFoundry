const { execFileSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");

try {
  execFileSync(process.execPath, [path.join("scripts", "verify-desktop-release-ref.cjs")], {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });
  execFileSync(process.execPath, [
    path.join("desktop", "scripts", "run-electron-builder.cjs"),
    "--win",
    "--x64",
    "--publish",
    "always",
  ], {
    cwd: repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      NOVELFOUNDRY_RELEASE_CHANNEL: "release",
    },
  });
} catch (error) {
  console.error("[publish:desktop:release] failed.", error);
  process.exit(1);
}
