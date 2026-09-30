const test = require("node:test");
const assert = require("node:assert/strict");

const { checkSchemaParity } = require("../scripts/check-schema-parity.cjs");

test("PostgreSQL and SQLite Prisma schemas expose the same model and enum contracts", () => {
  assert.deepEqual(checkSchemaParity(), []);
});
