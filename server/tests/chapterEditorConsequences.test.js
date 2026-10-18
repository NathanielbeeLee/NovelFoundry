const test = require("node:test");
const assert = require("node:assert/strict");
const { chapterEditorConsequenceAssessmentSchema, chapterEditorConsequenceAdoptRequestSchema } = require("@novelfoundry/shared/types/novel");
const { assertConsequenceRange, consequenceBinding, consequenceDigest, validateConsequenceEvidence } = require("../dist/services/novel/chapterEditor/consequences/domain/consequencePolicy.js");
const { ConsequenceReceiptStore } = require("../dist/services/novel/chapterEditor/consequences/infrastructure/ConsequenceReceiptStore.js");

// Offline adapters: any unintended provider/database access fails rather than reaching an environment.
for (const [name, exports] of [
  ["../dist/db/prisma.js", { prisma: new Proxy({}, { get() { throw new Error("Unexpected database access"); } }) }],
  ["../dist/services/novel/artifacts/persistence.js", { buildContentHash: require("../dist/services/novel/artifacts/domain/ChapterSourceIdentity.js").buildContentHash }],
  ["../dist/services/novel/NovelCoreService.js", { NovelCoreService: class {} }],
  ["../dist/prompting/core/promptRunner.js", { prepareStructuredPromptExecution() { throw new Error("Unexpected model preparation"); }, runPreparedStructuredPrompt() { throw new Error("Unexpected model call"); } }],
]) {
  const file = require.resolve(name);
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}
const { ChapterEditorConsequenceService } = require("../dist/services/novel/chapterEditor/consequences/application/ChapterEditorConsequenceService.js");
const { ConsequenceInventoryRepository } = require("../dist/services/novel/chapterEditor/consequences/infrastructure/ConsequenceInventoryRepository.js");

const input = () => ({ sessionId: "session", candidate: { id: "candidate", content: "她把钥匙留在桌上。" },
  contentSnapshot: "她拿走钥匙。\n\n她拿走钥匙。", expectedContent: "已保存正文", targetRange: { from: 0, to: 6, text: "她拿走钥匙。" }, provider: "openai", model: "fixture-model" });
const references = [{ refId: "storyPlan:next", label: "下一章计划", text: "她用钥匙开门。", chapterOrder: 2 }];
const assessment = () => ({ summary: "钥匙的后续用途需要核对。", recommendation: "review_local_followup", findings: [{ kind: "conflict", confidence: "supported", summary: "钥匙用途", reason: "下一章计划需要携带钥匙。", currentQuote: "她拿走钥匙。", candidateQuote: "她把钥匙留在桌上。", dependencies: [{ refId: "storyPlan:next", quote: "她用钥匙开门。" }], suggestedAction: "核对下一章取钥匙的衔接。" }], uncertainties: ["未评估未提供的后文。"] });

test("range and identity preserve exact bytes, null and duplicate selection positions", () => {
  const request = input();
  assert.equal(assertConsequenceRange(request), "她把钥匙留在桌上。\n\n她拿走钥匙。");
  const binding = consequenceBinding("book", "chapter", request, "revision");
  for (const changed of [
    { ...request, expectedContent: "已保存正文 " },
    { ...request, expectedContent: null },
    { ...request, contentSnapshot: request.contentSnapshot + " " },
    { ...request, candidate: { ...request.candidate, content: request.candidate.content + " " } },
    { ...request, targetRange: { from: 8, to: 14, text: "她拿走钥匙。" } },
  ]) assert.notEqual(consequenceBinding("book", "chapter", changed, "revision"), binding);
  assert.notEqual(consequenceDigest(null), consequenceDigest(""));
  assert.throws(() => assertConsequenceRange({ ...request, targetRange: { from: 1, to: 7, text: request.targetRange.text } }), /选区或正文/);
});

test("assessment schema rejects state deltas and evidence validation rejects invented references or quotes", () => {
  assert.doesNotThrow(() => validateConsequenceEvidence(chapterEditorConsequenceAssessmentSchema.parse(assessment()), input(), references));
  const changed = assessment(); changed.findings[0].dependencies[0].refId = "invented";
  assert.throws(() => validateConsequenceEvidence(changed, input(), references), /未提供/);
  const missingQuote = assessment(); missingQuote.findings[0].currentQuote = "不存在的原文";
  assert.throws(() => validateConsequenceEvidence(missingQuote, input(), references), /引文/);
  const certainFuture = assessment(); certainFuture.findings[0].kind = "possible_effect";
  assert.throws(() => validateConsequenceEvidence(certainFuture, input(), references), /不确定性/);
  assert.equal(chapterEditorConsequenceAssessmentSchema.safeParse({ ...assessment(), state_delta: { owner: "new" } }).success, false);
  const whitespace = assessment(); whitespace.findings[0].currentQuote = " ";
  assert.equal(chapterEditorConsequenceAssessmentSchema.safeParse(whitespace).success, false);
  assert.throws(() => validateConsequenceEvidence(whitespace, input(), references), /引文/);
  assert.throws(() => validateConsequenceEvidence(assessment(), input(), [{ ...references[0], freshness: "unverified" }]), /冲突依据/);
  assert.equal(chapterEditorConsequenceAdoptRequestSchema.safeParse({ ...input(), receipt: "00000000-0000-4000-8000-000000000000", state_delta: {} }).success, false);
});

test("receipts fail on expiry, eviction, another worker and changed prepared configuration", () => {
  let now = 1000;
  const store = new ConsequenceReceiptStore(() => now);
  const issued = store.issue("binding", "prepared");
  assert.doesNotThrow(() => store.verify(issued.receipt, "binding", "prepared"));
  assert.throws(() => store.verify(issued.receipt, "binding", "changed"), /配置已变化/);
  assert.throws(() => new ConsequenceReceiptStore(() => now).verify(issued.receipt, "binding"), /凭证已过期或服务已重启/);
  for (let i = 0; i < 40; i++) store.issue(`binding-${i}`, "prepared");
  assert.throws(() => store.verify(issued.receipt, "binding"), /凭证已过期/);
  const recent = store.issue("recent", "prepared"); now += 15 * 60 * 1000;
  assert.throws(() => store.verify(recent.receipt, "recent"), /凭证已过期/);
});

function harness() {
  let revision = "revision", preparedIdentity = "prepared";
  const calls = { writes: 0, snapshots: 0, model: 0, locks: 0 };
  const inventory = { load: async () => ({ savedContent: "已保存正文", references, guards: [], revision }),
    verifyAndLock: async (_book, _chapter, expected, tx) => { assert.equal(tx, "transaction"); calls.locks++; if (expected.revision !== revision) throw new Error("dependency changed inside transaction"); } };
  const core = { createNovelSnapshot: async () => { calls.snapshots++; }, updateChapter: async (_book, _chapter, write) => {
    assert.equal(write.expectedContent, "已保存正文");
    await write.beforeChapterUpdate("transaction");
    calls.writes++; return { id: "chapter", content: write.content };
  } };
  const prepare = async ({ asset }) => ({ asset, identityDigest: preparedIdentity });
  const run = async () => { calls.model++; return { output: chapterEditorConsequenceAssessmentSchema.parse(assessment()), meta: { provider: "openai", model: "fixture-model" } }; };
  const service = new ChapterEditorConsequenceService(inventory, core, new ConsequenceReceiptStore(), prepare, run);
  return { service, calls, setRevision: (value) => { revision = value; }, setPrepared: (value) => { preparedIdentity = value; }, core };
}

test("preview is advisory and writes no snapshots, prose or canonical state; adoption uses guarded source facade", async () => {
  const h = harness(); const report = await h.service.preview("book", "chapter", input());
  assert.deepEqual(h.calls, { writes: 0, snapshots: 0, model: 1, locks: 0 });
  const result = await h.service.adopt("book", "chapter", { ...input(), receipt: report.receipt });
  assert.equal(result.content, "她把钥匙留在桌上。\n\n她拿走钥匙。");
  assert.deepEqual(h.calls, { writes: 1, snapshots: 1, model: 1, locks: 1 });
  await assert.rejects(() => h.service.adopt("book", "chapter", { ...input(), receipt: report.receipt }), /凭证已过期/);
});

test("changed source, candidate, range, dependency or model cannot authorize stale adoption", async () => {
  for (const change of ["source", "candidate", "range", "dependency", "model"]) {
    const h = harness(); const report = await h.service.preview("book", "chapter", input()); const request = input();
    if (change === "source") request.contentSnapshot += " ";
    if (change === "candidate") request.candidate.content += " ";
    if (change === "range") request.targetRange = { from: 8, to: 14, text: "她拿走钥匙。" };
    if (change === "dependency") h.setRevision("new-revision");
    if (change === "model") h.setPrepared("new-prepared");
    await assert.rejects(() => h.service.adopt("book", "chapter", { ...request, receipt: report.receipt }));
    assert.equal(h.calls.writes, 0); assert.equal(h.calls.snapshots, 0);
  }
});

test("dependency change after outer verification is rechecked inside source write transaction", async () => {
  const h = harness(); const report = await h.service.preview("book", "chapter", input());
  h.core.createNovelSnapshot = async () => { h.setRevision("changed-after-check"); };
  await assert.rejects(() => h.service.adopt("book", "chapter", { ...input(), receipt: report.receipt }), /dependency changed inside transaction/);
  assert.equal(h.calls.writes, 0);
});

test("dependency locks use sorted expected revisions and reject mismatches before inventory reread", async () => {
  const repository = new ConsequenceInventoryRepository(); const locks = [];
  const expected = { revision: "revision", guards: [{ model: "storyPlan", id: "p", updatedAt: "2026-10-18T00:00:00.000Z" }, { model: "chapter", id: "c", updatedAt: "2026-10-18T00:00:00.000Z" }] };
  const tx = { $executeRaw: async (_sql, id) => { locks.push(id); return id === "p" ? 0 : 1; }, chapter: { findUnique: async () => ({ updatedAt: new Date("2026-10-18T00:00:00.000Z") }) } };
  await assert.rejects(() => repository.verifyAndLock("book", "chapter", expected, tx), /评估依据已变化/);
  assert.deepEqual(locks, ["c", "p"]);
});

test("legacy SQLite epoch timestamps retain their representation through dependency locks", async () => {
  const Database = require("better-sqlite3"); const db = new Database(":memory:");
  try {
    db.exec('CREATE TABLE "Chapter" (id TEXT PRIMARY KEY, updatedAt INTEGER NOT NULL)');
    const epoch = Date.parse("2026-10-18T00:00:00.000Z");
    db.prepare('INSERT INTO "Chapter" (id, updatedAt) VALUES (?, ?)').run("c", epoch);
    const expected = { revision: "same", guards: [{ model: "chapter", id: "c", updatedAt: new Date(epoch).toISOString() }] };
    const repository = new ConsequenceInventoryRepository(); repository.load = async () => expected;
    const tx = { $executeRaw: async (sql, ...parameters) => db.prepare(sql.join("?")).run(...parameters).changes,
      chapter: { findUnique: async ({ where }) => { const row = db.prepare('SELECT updatedAt FROM "Chapter" WHERE id=?').get(where.id); return row ? { updatedAt: new Date(row.updatedAt) } : null; } } };
    await repository.verifyAndLock("book", "c", expected, tx);
    assert.equal(db.prepare('SELECT typeof(updatedAt) AS type FROM "Chapter"').get().type, "integer");
  } finally { db.close(); }
});

test("stale snapshots are unavailable and current snapshot source chapters enter the guard set", async () => {
  const { buildContentHash } = require("../dist/services/novel/artifacts/domain/ChapterSourceIdentity.js");
  const date = new Date("2026-10-18T00:00:00.000Z");
  const current = { id: "current", novelId: "book", order: 2, title: "本章", content: "当前正文", updatedAt: date };
  const snapshot = { id: "snapshot", sourceChapterId: "previous", updatedAt: date, sourceContentHash: buildContentHash("旧正文"), summary: "旧事实", sourceChapter: { id: "previous", content: "新正文", updatedAt: date } };
  const db = { chapter: { findFirst: async () => current, findMany: async () => [] },
    storyPlan: { findMany: async () => [] }, volumeChapterPlan: { findMany: async () => [] },
    storyStateSnapshot: { findFirst: async () => snapshot }, characterResourceLedgerItem: { findMany: async () => [] }, payoffLedgerItem: { findMany: async () => [] } };
  const repository = new ConsequenceInventoryRepository();
  const stale = await repository.load("book", "current", db);
  assert.equal(stale.references.some((reference) => reference.refId === "storyStateSnapshot:snapshot"), false);
  assert.ok(stale.limitations.some((text) => text.includes("状态快照")));
  snapshot.sourceContentHash = buildContentHash("新正文");
  const fresh = await repository.load("book", "current", db);
  assert.ok(fresh.guards.some((guard) => guard.model === "chapter" && guard.id === "previous"));
  assert.ok(fresh.references.some((reference) => reference.refId === "storyStateSnapshot:snapshot"));
  snapshot.sourceChapter.content += " ";
  const whitespaceChanged = await repository.load("book", "current", db);
  assert.notEqual(whitespaceChanged.revision, fresh.revision);
});

test("serialization and deadlock failures revoke receipt and become explicit stale-assessment conflicts", async () => {
  for (const code of ["P2034", "40001", "40P01"]) {
    const h = harness(); const report = await h.service.preview("book", "chapter", input());
    h.core.updateChapter = async () => { throw Object.assign(new Error("transaction conflict"), { code }); };
    await assert.rejects(() => h.service.adopt("book", "chapter", { ...input(), receipt: report.receipt }), (error) => error.statusCode === 409 && /并发变化/.test(error.message));
    await assert.rejects(() => h.service.adopt("book", "chapter", { ...input(), receipt: report.receipt }), /凭证已过期/);
    assert.equal(h.calls.writes, 0);
  }
});

test("the real application facade constructs the consequence service before copying capability methods", async () => {
  const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
  const modules = new Map();
  class FakeCore {}
  class FakeConsequences {
    constructor(_inventory, core) { assert.ok(core instanceof FakeCore); }
    async preview(...args) { return ["preview", ...args]; }
    async adopt(...args) { return ["adopt", ...args]; }
  }
  const directory = path.join(__dirname, "../dist/services/novel/application/capabilities");
  const fakeExports = new Proxy({}, { get(_target, name) { return String(name).startsWith("register") ? () => {} : class {}; } });
  const load = (name) => {
    if (modules.has(name)) return modules.get(name);
    const exports = {}; modules.set(name, exports);
    const localRequire = (specifier) => {
      if (specifier.endsWith("/NovelCoreService")) return { NovelCoreService: FakeCore };
      if (specifier.endsWith("/chapterEditor/consequences")) return { ChapterEditorConsequenceService: FakeConsequences };
      const nested = specifier.replace(/^\.\//, "");
      if (["NovelApplicationContext", "NovelPlanningApplication"].includes(nested)) return load(nested);
      return fakeExports;
    };
    const source = fs.readFileSync(path.join(directory, `${name}.js`), "utf8");
    vm.runInNewContext("(function(exports, require) {" + source + "\n})", {}, { filename: name })(exports, localRequire);
    return exports;
  };
  const { createNovelApplicationServices } = load("DefaultNovelApplicationServices");
  const facade = createNovelApplicationServices();
  assert.deepEqual(await facade.previewChapterConsequences("book", "chapter", "request"), ["preview", "book", "chapter", "request"]);
  assert.deepEqual(await facade.adoptChapterConsequenceCandidate("book", "chapter", "request"), ["adopt", "book", "chapter", "request"]);
});
