const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");
const { PrismaClient } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
const dbModule = require.resolve("../dist/db/prisma.js");
const { researchExtractPrompt } = require("../dist/prompting/prompts/knowledge/research/prompts.js");
const { groundResearchFindings, assertResearchInput, researchContentHash, isResearchFindingFresh } = require("../dist/services/knowledge/research/domain/researchPolicy.js");
const rawFinding = (quote, patch = {}) => ({ claim: `结论：${quote}`, quote, startOffset: null, endOffset: null, uncertainty: "单份资料，尚未交叉验证。", ...patch });

test("research prompt imports no database/router and preserves complete input", () => {
  assert.equal(require.cache[dbModule], undefined);
  const content = "🧪全文开头\n" + "材料".repeat(5000) + "全文结尾";
  const messages = researchExtractPrompt.render({ title: "fixture", reliabilityReason: "unverified", content });
  assert.equal(JSON.parse(messages[1].content).content, content);
  assert.match(messages[0].content, /不可信数据/);
  assert.equal(researchExtractPrompt.id, "knowledge.research.extract");
  assert.throws(() => assertResearchInput("x".repeat(12001)), /不会截取/);
  assert.deepEqual(groundResearchFindings({ findings: [] }, "没有充分依据"), []);
});

test("research excerpts reject hallucinated, ambiguous and split-surrogate evidence", () => {
  assert.throws(() => groundResearchFindings({ findings: [rawFinding("不存在")] }, "真实资料"), /引文/);
  assert.throws(() => groundResearchFindings({ findings: [rawFinding("重复")] }, "重复与重复"), /引文/);
  assert.throws(() => groundResearchFindings({ findings: [rawFinding("\ud83e", { startOffset: 0, endOffset: 1 })] }, "🧪实验"), /引文/);
  const result = groundResearchFindings({ findings: [rawFinding("真实资料", { startOffset: 0, endOffset: 999 })] }, "真实资料");
  assert.equal(result[0].endOffset, 4);
  const repeated = groundResearchFindings({ findings: [rawFinding("重复", { startOffset: 3, endOffset: 5 })] }, "重复与重复");
  assert.equal(repeated[0].startOffset, 3);
  const source = { enabled: true, revision: "r", contentHash: researchContentHash("真实资料"), documentVersionId: "v",
    documentVersion: { content: "真实资料", document: { status: "enabled", activeVersionId: "v" } } };
  assert.equal(isResearchFindingFresh({ ...result[0], sourceRevision: "r", contentHash: source.contentHash, endOffset: 999 }, source), false);
});

test("SQLite research lifecycle, repeat-safe migration, restart, freshness, adoption and concurrency", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "novelfoundry-research-"));
  const dbPath = path.join(directory, "fixture.db");
  const sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE "Novel" (id TEXT PRIMARY KEY, title TEXT NOT NULL, updatedAt DATETIME NOT NULL);
    CREATE TABLE "KnowledgeDocument" (id TEXT PRIMARY KEY, title TEXT NOT NULL, fileName TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'user_upload', sourceAnalysisId TEXT, status TEXT NOT NULL DEFAULT 'enabled',
      activeVersionId TEXT, activeVersionNumber INTEGER NOT NULL DEFAULT 1, latestIndexStatus TEXT NOT NULL DEFAULT 'idle',
      lastIndexedAt DATETIME, createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL);
    CREATE TABLE "KnowledgeDocumentVersion" (id TEXT PRIMARY KEY, documentId TEXT NOT NULL, versionNumber INTEGER NOT NULL,
      content TEXT NOT NULL, contentHash TEXT NOT NULL, charCount INTEGER NOT NULL, createdAt DATETIME NOT NULL);
  `);
  const migration = fs.readFileSync(path.join(__dirname, "../src/prisma/migrations.sqlite/20261015110000_knowledge_research/migration.sql"), "utf8");
  sqlite.exec(migration);
  const now = Date.now();
  sqlite.prepare('INSERT INTO "Novel" VALUES (?, ?, ?)').run("novel", "小说", now);
  function seedDocument(id, content) {
    sqlite.prepare('INSERT INTO "KnowledgeDocument" (id,title,fileName,activeVersionId,createdAt,updatedAt) VALUES (?,?,?,?,?,?)').run(id, id, `${id}.txt`, `${id}-v1`, now, now);
    sqlite.prepare('INSERT INTO "KnowledgeDocumentVersion" VALUES (?,?,?,?,?,?,?)').run(`${id}-v1`, id, 1, content, researchContentHash(content), content.length, now);
  }
  seedDocument("doc", "一号事实。二号事实。三号事实。四号事实。五号事实。🧪结尾。");
  seedDocument("other", "六号事实。");
  const client = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${dbPath}` }) });
  require.cache[dbModule] = { exports: { prisma: client } };
  const storePath = require.resolve("../dist/services/knowledge/research/infrastructure/ResearchStore.js");
  let store = require(storePath);
  const makeInput = (id, expectedRevision = null, patch = {}) => ({ documentVersionId: `${id}-v1`, expectedRevision,
    title: id, reliabilityReason: "待核实", enabled: true, ...patch });
  try {
    let source = await store.saveResearchSource("doc", makeInput("doc"));
    sqlite.exec(migration);
    assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM "KnowledgeResearchSource"').get().n, 1);
    const unchanged = await store.saveResearchSource("doc", makeInput("doc", source.revision));
    assert.equal(unchanged.revision, source.revision);
    const quotes = ["一号事实。", "二号事实。", "三号事实。", "四号事实。", "五号事实。"];
    source = await store.storeResearchFindings("doc", source.id, source.revision, "一号事实。二号事实。三号事实。四号事实。五号事实。🧪结尾。", { findings: quotes.map(quote => rawFinding(quote)) });
    assert.equal(source.findings.length, 5);
    assert.deepEqual(await store.readResearchAnchors("novel"), []);
    await store.setResearchAdoption("doc", source.findings[0].findingId, "novel", true);
    assert.equal((await store.readResearchAnchors("novel")).length, 1);
    delete require.cache[storePath]; store = require(storePath);
    assert.equal((await store.readResearchAnchors("novel"))[0].quote, source.findings[0].quote);
    await store.setResearchAdoption("doc", source.findings[0].findingId, "novel", false);
    assert.deepEqual(await store.readResearchAnchors("novel"), []);
    let other = await store.saveResearchSource("other", makeInput("other"));
    other = await store.storeResearchFindings("other", other.id, other.revision, "六号事实。", { findings: [rawFinding("六号事实。")] });
    const results = await Promise.allSettled([...source.findings.map(finding => ["doc", finding.findingId]), ["other", other.findings[0].findingId]]
      .map(([documentId, findingId]) => store.setResearchAdoption(documentId, findingId, "novel", true)));
    assert.equal(results.filter(result => result.status === "fulfilled").length, 5);
    assert.equal(results.filter(result => result.status === "rejected" && result.reason.statusCode === 409).length, 1);
    assert.equal((await store.listResearchAdoptions("novel")).length, 5);
    assert.equal((await store.readResearchAnchors("novel")).length, 5);
    await client.knowledgeDocument.update({ where: { id: "doc" }, data: { status: "disabled" } });
    assert.ok((await store.readResearchAnchors("novel")).every(item => item.documentVersionId !== "doc-v1"));
    await assert.rejects(store.setResearchAdoption("doc", source.findings[0].findingId, "novel", true), error => error.statusCode === 409);
    await client.knowledgeDocument.update({ where: { id: "doc" }, data: { status: "enabled", activeVersionId: "doc-v2" } });
    assert.ok((await store.readResearchAnchors("novel")).every(item => item.documentVersionId !== "doc-v1"));
    // Revocation remains available for stale versions and disabled sources.
    assert.equal(await store.setResearchAdoption("doc", source.findings[0].findingId, "novel", false), null);
    assert.equal((await store.listResearchAdoptions("novel")).some(item => item.findingId === source.findings[0].findingId), false);
    await client.knowledgeDocument.update({ where: { id: "doc" }, data: { activeVersionId: "doc-v1" } });
    const oldRevision = source.revision;
    source = await store.saveResearchSource("doc", makeInput("doc", oldRevision, { author: "核实作者" }));
    assert.ok(source.findings.every(finding => !finding.fresh));
    assert.ok((await store.readResearchAnchors("novel")).every(item => item.documentVersionId !== "doc-v1"));
    await assert.rejects(store.storeResearchFindings("doc", source.id, oldRevision, "一号事实。二号事实。三号事实。四号事实。五号事实。🧪结尾。", { findings: [rawFinding("一号事实。")] }), error => error.statusCode === 409);
    await assert.rejects(store.saveResearchSource("doc", makeInput("doc", oldRevision)), error => error.statusCode === 409);
    await client.knowledgeDocumentVersion.update({ where: { id: "doc-v1" }, data: { content: "被修改的原文" } });
    await assert.rejects(store.loadExtractionSource("doc", source.revision), error => error.statusCode === 409);
    assert.equal((await store.readResearchSource("doc")).fresh, false);
    // Shared provider persistence uses decoded dates after locking, including legacy SQLite epochs.
    sqlite.exec(`CREATE TABLE "APIKey" (id TEXT PRIMARY KEY, provider TEXT UNIQUE, displayName TEXT, key TEXT, model TEXT,
      baseURL TEXT, requestProtocol TEXT DEFAULT 'auto', authMode TEXT DEFAULT 'bearer', reasoningEffort TEXT,
      hiddenModels TEXT DEFAULT '[]', isActive BOOLEAN DEFAULT true, reasoningEnabled BOOLEAN DEFAULT true,
      concurrencyLimit INTEGER DEFAULT 0, requestIntervalMs INTEGER DEFAULT 0, createdAt DATETIME, updatedAt DATETIME);
      CREATE TABLE "AppSetting" (key TEXT PRIMARY KEY, value TEXT NOT NULL, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL);`);
    sqlite.prepare('INSERT INTO "APIKey" (id,provider,key,baseURL,model,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)')
      .run("provider-id", "custom_legacy", "fixture-secret", "https://fixture.invalid", "manual", now, now);
    const providerStore = require("../dist/services/settings/providers/infrastructure/ProviderDiscoveryStore.js");
    const provider = await client.aPIKey.findUnique({ where: { provider: "custom_legacy" } });
    assert.equal(await providerStore.saveProviderDiscovery(provider, ["discovered"], 100), true);
    assert.deepEqual((await providerStore.readProviderDiscovery(provider)).models, ["discovered"]);
    assert.equal(+provider.updatedAt, +(await client.aPIKey.findUnique({ where: { provider: "custom_legacy" } })).updatedAt);
    await client.aPIKey.update({ where: { provider: "custom_legacy" }, data: { key: "rotated" } });
    assert.equal(await providerStore.saveProviderDiscovery(provider, ["stale"], 200), false);
    await client.appSetting.create({ data: { key: "llm.currentSelection", value: JSON.stringify({ provider: "custom_fixture", model: "fixture-model" }) } });
    const runner = require("../dist/prompting/core/promptRunner.js");
    const runPrompt = runner.runStructuredPrompt;
    const { extractResearch } = require("../dist/services/knowledge/research/application/ResearchService.js");
    const beforeFailure = await store.readResearchSource("other");
    try {
      runner.runStructuredPrompt = async () => { throw new Error("fixture model unavailable"); };
      await assert.rejects(extractResearch("other", beforeFailure.revision), /fixture model unavailable/);
      assert.deepEqual(await store.readResearchSource("other"), beforeFailure);
      runner.runStructuredPrompt = async ({ promptInput }) => {
        assert.equal(promptInput.content, "六号事实。");
        return { output: [] };
      };
      const noFindings = await extractResearch("other", beforeFailure.revision);
      assert.ok(noFindings.findings.every(finding => !finding.fresh));
      assert.notEqual(noFindings.revision, beforeFailure.revision);
    } finally { runner.runStructuredPrompt = runPrompt; }
    const foreignKeys = sqlite.pragma("foreign_key_check");
    assert.deepEqual(foreignKeys, []);
  } finally {
    await client.$disconnect(); sqlite.close(); fs.rmSync(directory, { recursive: true, force: true });
  }
});
