const test = require("node:test");
const assert = require("node:assert/strict");
const {
  characterContextLimit,
  characterImportanceRank,
  inferCharacterImportanceTier,
} = require("../dist/services/novel/characters/characterImportance");

test("explicit character importance wins over cast role inference", () => {
  assert.equal(inferCharacterImportanceTier("extra", "protagonist"), "extra");
});

test("structured cast roles receive stable default tiers", () => {
  assert.equal(inferCharacterImportanceTier(undefined, "protagonist"), "lead");
  assert.equal(inferCharacterImportanceTier(undefined, "mentor"), "major");
  assert.equal(inferCharacterImportanceTier(undefined, "catalyst"), "named");
});

test("higher importance receives earlier rank and more context", () => {
  assert.ok(characterImportanceRank("lead") < characterImportanceRank("extra"));
  assert.ok(characterContextLimit("lead") > characterContextLimit("extra"));
});
