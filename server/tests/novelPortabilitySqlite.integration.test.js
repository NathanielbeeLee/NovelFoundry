const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const Database = require("better-sqlite3");
const { PrismaClient, AuditType } = require("@prisma/client");
const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");

// All DB/filesystem writes are restricted to a newly allocated fixture directory.
test("real SQLite round trip and polish inverse preserve FK assets, dates and original book", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "novel-portability-sqlite-"));
  const previousRuntime = process.env.NOVELFOUNDRY_RUNTIME;
  const previousData = process.env.NOVELFOUNDRY_APP_DATA_DIR;
  process.env.NOVELFOUNDRY_RUNTIME = "desktop";
  process.env.NOVELFOUNDRY_APP_DATA_DIR = directory;
  const file = path.join(directory, "fixture.sqlite");
  let client;
  try {
    const ddl = execFileSync("pnpm", ["exec", "prisma", "migrate", "diff", "--from-empty", "--to-schema", "src/prisma/schema.sqlite.prisma", "--script"], {
      cwd: path.join(__dirname, ".."), encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
    });
    const sqlite = new Database(file);
    try { sqlite.exec(ddl); } finally { sqlite.close(); }
    client = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${file}` }) });
    const dbPath = require.resolve("../dist/db/prisma.js");
    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { prisma: client } };
    const backup = require("../dist/modules/novel/export/backup");
    const { withPolishRevision } = require("../dist/modules/novel/quality/application/polish/PolishExecutionScope");
    const { PolishRevisionService } = require("../dist/modules/novel/quality/application/polish/PolishRevisionService");
    const { polishPrisma } = require("../dist/modules/novel/quality/polishPersistence");
    const { ChapterLifecycleService } = require("../dist/services/novel/runtime/lifecycle");
    const world = await client.world.create({ data: { name: "独立世界" } });
    const document = await client.knowledgeDocument.create({ data: { title: "参考", fileName: "reference.txt" } });
    const version = await client.knowledgeDocumentVersion.create({ data: { documentId: document.id, versionNumber: 1, content: "资料原文", contentHash: "source-hash", charCount: 4 } });
    await client.knowledgeDocument.update({ where: { id: document.id }, data: { activeVersionId: version.id, activeVersionNumber: 1 } });
    const novel = await client.novel.create({ data: { title: "原作品", worldId: world.id, sourceKnowledgeDocumentId: document.id } });
    const chapter = await client.chapter.create({ data: { novelId: novel.id, title: "开篇", order: 1, content: "原始正文", chapterStatus: "completed", generationState: "approved" } });
    const hero = await client.character.create({ data: { novelId: novel.id, name: "主角", role: "主角", currentState: "旧状态" } });
    const archive = await backup.exportNovelBackup(novel.id);
    const preview = backup.previewNovelBackup(archive);
    const options = { title: "独立副本", expectedDigest: preview.digest, requestId: "fixture-restore-request" };
    const restored = await backup.restoreNovelBackup(archive, options);
    assert.deepEqual(await backup.restoreNovelBackup(archive, options), restored);
    assert.equal(await client.novel.count(), 2);
    const imported = await client.novel.findUnique({ where: { id: restored.novelId }, include: { chapters: true, world: true, sourceKnowledgeDocument: { include: { activeVersion: true } } } });
    assert.notEqual(imported.worldId, world.id);
    assert.notEqual(imported.sourceKnowledgeDocumentId, document.id);
    assert.equal(imported.sourceKnowledgeDocument.activeVersion.content, "资料原文");
    assert.equal(imported.chapters[0].content, "原始正文");
    assert.notEqual(imported.chapters[0].id, chapter.id);
    const initialChapter = await client.chapter.findUnique({ where: { id: chapter.id } });
    const initialHero = await client.character.findUnique({ where: { id: hero.id } });
    const lifecycle = new ChapterLifecycleService();
    await withPolishRevision({ enabled: true, novelId: novel.id, chapterId: chapter.id, jobId: "fixture-polish" }, async () => {
      await lifecycle.saveWorkingContent({ novelId: novel.id, chapterId: chapter.id, content: "润色后的正文", generationState: "repaired" });
      await polishPrisma.character.update({ where: { id: hero.id }, data: { currentState: "新状态" } });
      await polishPrisma.auditReport.create({ data: {
        novelId: novel.id, chapterId: chapter.id, auditType: Object.values(AuditType)[0],
        issues: { create: { auditType: Object.values(AuditType)[0], severity: "low", code: "fixture", description: "检查", evidence: "证据", fixSuggestion: "建议" } },
      } });
      await lifecycle.markChapterStatus(chapter.id, "pending_review");
    });
    const revision = await client.chapterPolishRevision.findFirst({ where: { novelId: novel.id } });
    const service = new PolishRevisionService();
    assert.equal((await service.detail(novel.id, revision.id)).undoEligibility.allowed, true);
    await service.undo(novel.id, revision.id, revision.afterRawHash);
    assert.deepEqual(await client.chapter.findUnique({ where: { id: chapter.id } }), initialChapter);
    assert.deepEqual(await client.character.findUnique({ where: { id: hero.id } }), initialHero);
    assert.equal(await client.auditReport.count(), 0);
    assert.equal(await client.auditIssue.count(), 0);
    const journal = await client.chapterPolishRevision.findUnique({ where: { id: revision.id } });
    const verified = JSON.parse(journal.afterChapterStateJson).backup;
    assert.ok(verified.path.startsWith(directory + path.sep));
    assert.equal(fs.statSync(verified.path).size, verified.bytes);
    assert.equal(await client.novel.count(), 2);
    const check = new Database(file);
    try { assert.deepEqual(check.pragma("foreign_key_check"), []); } finally { check.close(); }
  } finally {
    await client?.$disconnect();
    if (previousRuntime === undefined) delete process.env.NOVELFOUNDRY_RUNTIME; else process.env.NOVELFOUNDRY_RUNTIME = previousRuntime;
    if (previousData === undefined) delete process.env.NOVELFOUNDRY_APP_DATA_DIR; else process.env.NOVELFOUNDRY_APP_DATA_DIR = previousData;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
