const path = require("node:path");

const { version } = require(path.join(__dirname, "..", "desktop", "package.json"));
const expectedRef = `refs/tags/v${version}`;
const actualRef = process.env.GITHUB_REF || "";
const repository = process.env.GITHUB_REPOSITORY || "";

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error(`Desktop version must be stable semver: ${version}`);
}
if (actualRef !== expectedRef) {
  throw new Error(`Desktop release requires ${expectedRef}; received ${actualRef || "(none)"}.`);
}
if (!/^[^/]+\/NovelFoundry$/i.test(repository)) {
  throw new Error(`Desktop release requires the independent NovelFoundry repository; received ${repository || "(none)"}.`);
}

console.log(`Desktop release ref verified: ${repository}@${expectedRef}`);
