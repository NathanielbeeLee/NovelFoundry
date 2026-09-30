const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

const root = path.join(__dirname, "../src/prisma");
const migrations = ["20260911200000_novel_backup_import", "20260911210000_chapter_polish_history"];
const models = ["NovelBackupImportReceipt", "ChapterPolishRevision", "ChapterPolishMutation"];

test("backup and polish contracts match across SQLite and PostgreSQL schemas", () => {
  const schemas = ["schema.prisma", "schema.sqlite.prisma"].map((file) => fs.readFileSync(path.join(root, file), "utf8"));
  for (const name of models) {
    const extract = (schema) => schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1].trim().replace(/\s+/g, " ");
    assert.ok(extract(schemas[0]), `${name} exists`);
    assert.equal(extract(schemas[0]), extract(schemas[1]), name);
  }
});

test("portable-book migrations preserve rows on repeat and enforce journal relationships", () => {
  const db = new Database(":memory:");
  try {
    db.pragma("foreign_keys = ON");
    db.exec('CREATE TABLE "Novel" ("id" TEXT PRIMARY KEY); CREATE TABLE "Chapter" ("id" TEXT PRIMARY KEY);');
    const apply = () => migrations.forEach((name) => db.exec(fs.readFileSync(path.join(root, "migrations.sqlite", name, "migration.sql"), "utf8")));
    apply();
    db.exec("INSERT INTO Novel VALUES ('n'); INSERT INTO Chapter VALUES ('c');");
    db.prepare('INSERT INTO NovelBackupImportReceipt (requestId, novelId, digest, title) VALUES (?, ?, ?, ?)').run("request", "n", "digest", "新副本");
    const revision = db.prepare('INSERT INTO ChapterPolishRevision (id, novelId, chapterId, operationKey, beforeContent, beforeRawHash) VALUES (?, ?, ?, ?, ?, ?)');
    revision.run("r", "n", "c", "op", "原文", "raw");
    const mutation = db.prepare('INSERT INTO ChapterPolishMutation (id, revisionId, sequence, entityType, entityId) VALUES (?, ?, ?, ?, ?)');
    mutation.run("m", "r", 1, "chapter", "c");
    apply();
    assert.equal(db.prepare("SELECT beforeContent FROM ChapterPolishRevision WHERE id='r'").get().beforeContent, "原文");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM NovelBackupImportReceipt").get().n, 1);
    assert.throws(() => revision.run("r2", "n", "c", "op", "other", "raw"), /UNIQUE/);
    assert.throws(() => mutation.run("m2", "r", 1, "chapter", "c"), /UNIQUE/);
    assert.throws(() => mutation.run("m3", "missing", 1, "chapter", "c"), /FOREIGN KEY/);
    assert.deepEqual(db.pragma("foreign_key_check"), []);
  } finally { db.close(); }
});
