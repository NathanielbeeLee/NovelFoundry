const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { prisma } = require("../dist/db/prisma.js");
const { ChapterQualityGateService } = require("../dist/services/novel/runtime/ChapterQualityGateService.js");

function result(unavailable = false) {
  const score = { coherence: 90, pacing: 90, repetition: 90, voice: 90, engagement: 90, overall: 90 };
  return { score, issues: [], auditReports: [], assessment: {
    status: unavailable ? "continue_with_risk" : "accepted", score, summary: "Fixture assessment",
    blockingIssues: [], repairDirectives: [], missingObligations: [], repairability: "none", decisionReason: "Fixture",
    riskTags: unavailable ? ["acceptance_gate_unavailable"] : [], continuePolicy: "continue",
    assetSyncRecommendation: { priority: "normal", reason: "Fixture", requiresFullPayoffReconcile: false },
  } };
}

function input() {
  return { novelId: "fixture-novel", chapterId: "fixture-chapter", content: "Draft", request: {},
    contextPackage: { chapter: { id: "fixture-chapter", title: "Arrival", order: 1, targetWordCount: 3000 }, bookContract: { title: "Book" } } };
}

function setup(t, options = {}) {
  const persisted = new Map();
  let calls = 0, reads = 0, writes = 0;
  let identityRevision = "initial";
  const key = (where) => JSON.stringify(where.novelId_chapterId_contentHash_artifactType_syncMode);
  const checkpoints = prisma.chapterArtifactSyncCheckpoint;
  const originalFindUnique = checkpoints.findUnique;
  const originalUpsert = checkpoints.upsert;
  t.after(() => { checkpoints.findUnique = originalFindUnique; checkpoints.upsert = originalUpsert; });
  // Prisma delegates expose dynamic proxy methods, not mock.method descriptors.
  checkpoints.findUnique = async ({ where }) => {
    reads += 1;
    if (options.readFailure) throw new Error("Fixture cache read failed");
    if (options.delay) await new Promise((resolve) => setTimeout(resolve, 10));
    if (options.persisted) return options.persisted(where);
    return persisted.get(key(where)) ?? null;
  };
  checkpoints.upsert = async ({ where, create }) => {
    writes += 1;
    if (options.writeFailure) throw new Error("Fixture cache write failed");
    persisted.set(key(where), create);
  };
  const assessor = {
    prepare: async (value) => ({ identityDigest: options.noIdentity ? null : createHash("sha256").update(JSON.stringify({
      revision: identityRevision, title: value.novelTitle, target: value.targetWordCount, content: value.content,
    })).digest("hex") }),
    assess: async (value, prepared) => {
      calls += 1;
      assert.ok(prepared || options.legacy);
      if (options.failOnce && calls === 1) throw options.failOnce;
      return result(options.unavailableOnce && calls === 1);
    },
  };
  if (options.legacy) delete assessor.prepare;
  return { make: () => new ChapterQualityGateService({ acceptanceAssessmentService: assessor }), persisted,
    stats: () => ({ calls, reads, writes }), changeRevision: () => { identityRevision = "changed"; } };
}

test("concurrent matching requests share persistent lookup and invocation, then reuse memory and exact persisted identity", async (t) => {
  const fixture = setup(t, { delay: true });
  const service = fixture.make();
  const [first, second] = await Promise.all([service.runAcceptanceGate(input()), service.runAcceptanceGate(input())]);
  assert.equal(first, second);
  assert.deepEqual(fixture.stats(), { calls: 1, reads: 1, writes: 1 });
  await service.runAcceptanceGate(input());
  assert.deepEqual(fixture.stats(), { calls: 1, reads: 1, writes: 1 });
  await fixture.make().runAcceptanceGate(input());
  assert.deepEqual(fixture.stats(), { calls: 1, reads: 2, writes: 1 });
  const stored = [...fixture.persisted.values()][0];
  const payload = JSON.parse(stored.metadataJson);
  assert.equal(payload.schemaVersion, 2);
  assert.match(stored.syncMode, /^prepared_v2_[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(payload).sort(), ["contentHash", "gate", "requestKey", "result", "schemaVersion"]);
});

test("changed effective identity, target length or title invalidates both cache layers", async (t) => {
  const fixture = setup(t);
  const service = fixture.make();
  const request = input();
  await service.runAcceptanceGate(request);
  fixture.changeRevision();
  await service.runAcceptanceGate(request);
  request.contextPackage.chapter.targetWordCount = 4000;
  await service.runAcceptanceGate(request);
  request.contextPackage.bookContract.title = "Other book";
  await service.runAcceptanceGate(request);
  assert.equal(fixture.stats().calls, 4);
});

test("old, malformed or mismatched cache rows are misses and never become content-only reuse", async (t) => {
  for (const mode of ["old", "mismatch", "malformed"]) {
    await t.test(mode, async (t) => {
      const fixture = setup(t, { persisted: (where) => {
        const identity = where.novelId_chapterId_contentHash_artifactType_syncMode;
        return { status: "succeeded", metadataJson: JSON.stringify({
          schemaVersion: mode === "old" ? 1 : 2, gate: "acceptance", contentHash: identity.contentHash,
          requestKey: mode === "mismatch" ? "different" : identity.syncMode.slice("prepared_v2_".length),
          result: mode === "malformed" ? { assessment: { riskTags: [], blockingIssues: [] }, issues: [], auditReports: [] } : result(),
        }) };
      } });
      await fixture.make().runAcceptanceGate(input());
      assert.equal(fixture.stats().calls, 1);
    });
  }
});

test("unavailable results leave neither completed cache nor persisted success and can be retried", async (t) => {
  const fixture = setup(t, { unavailableOnce: true });
  const service = fixture.make();
  assert.deepEqual((await service.runAcceptanceGate(input())).assessment.riskTags, ["acceptance_gate_unavailable"]);
  assert.deepEqual(fixture.stats(), { calls: 1, reads: 1, writes: 0 });
  assert.equal((await service.runAcceptanceGate(input())).assessment.status, "accepted");
  assert.deepEqual(fixture.stats(), { calls: 2, reads: 2, writes: 1 });
});

test("failed or cancelled assessment removes the pending entry and preserves the original failure", async (t) => {
  const failure = Object.assign(new Error("Fixture cancelled"), { name: "AbortError" });
  const fixture = setup(t, { failOnce: failure });
  const service = fixture.make();
  await assert.rejects(service.runAcceptanceGate(input()), (error) => error === failure);
  await service.runAcceptanceGate(input());
  assert.equal(fixture.stats().calls, 2);
});

test("cache I/O failure remains fail-open while unverifiable or legacy assessors never reuse", async (t) => {
  const fixture = setup(t, { readFailure: true, writeFailure: true });
  const service = fixture.make();
  await service.runAcceptanceGate(input());
  await service.runAcceptanceGate(input());
  assert.equal(fixture.stats().calls, 1);
  for (const options of [{ noIdentity: true }, { legacy: true }]) {
    await t.test(JSON.stringify(options), async (t) => {
      const fixture = setup(t, options);
      const service = fixture.make();
      await service.runAcceptanceGate(input());
      await service.runAcceptanceGate(input());
      assert.deepEqual(fixture.stats(), { calls: 2, reads: 0, writes: 0 });
    });
  }
});
