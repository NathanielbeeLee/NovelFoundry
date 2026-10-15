const test = require("node:test");
const assert = require("node:assert/strict");
const { persistChapterUpdate } = require("../dist/services/novel/coreCrud/infrastructure/ChapterUpdatePersistence.js");

// A serialized transactional store models interleavings at the conditional write.
// The assertions verify that persistence actually supplies all CAS predicates.
function store(content = "original") {
  let row = { id: "chapter", novelId: "novel", content, title: "Title", updatedAt: new Date(0) };
  let pending = Promise.resolve();
  const calls = [];
  const db = { $transaction(run) {
    const next = pending.then(async () => {
      const before = { ...row };
      try {
        return await run({ chapter: {
          async updateMany({ where, data }) {
            calls.push(where);
            assert.equal(where.id, "chapter");
            assert.ok(where.novelId);
            if (where.id !== row.id || where.novelId !== row.novelId
              || (Object.hasOwn(where, "content") && where.content !== row.content)) return { count: 0 };
            row = { ...row, ...data, updatedAt: new Date(row.updatedAt.getTime() + 1) };
            return { count: 1 };
          },
          async findFirst({ where }) {
            return where.id === row.id && where.novelId === row.novelId ? { ...row } : null;
          },
        } });
      } catch (error) { row = before; throw error; }
    });
    pending = next.catch(() => {});
    return next;
  } };
  return { db, calls, read: () => row };
}

test("two clients sharing one baseline: only one commits; loser sees winning prose", async () => {
  const fixture = store();
  const results = await Promise.allSettled([
    persistChapterUpdate(fixture.db, "novel", "chapter", { content: "first", expectedContent: "original" }),
    persistChapterUpdate(fixture.db, "novel", "chapter", { content: "second", expectedContent: "original" }),
  ]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.equal(results[1].reason.statusCode, 409);
  assert.equal(results[1].reason.conflict.currentContent, "first");
  assert.equal(fixture.read().content, "first");
  assert.equal(fixture.read().expectedContent, undefined);
});

test("legacy prose is rejected before opening a transaction; metadata remains compatible", async () => {
  const fixture = store();
  await assert.rejects(persistChapterUpdate(fixture.db, "novel", "chapter", { content: "unsafe" }), { statusCode: 428 });
  assert.equal(fixture.calls.length, 0);
  const result = await persistChapterUpdate(fixture.db, "novel", "chapter", { title: "New title" });
  assert.equal(result.title, "New title");
  assert.equal(result.content, "original");
});

test("novel identity is part of mutation, and failed CAS changes no metadata", async () => {
  const fixture = store("AI revision");
  await assert.rejects(persistChapterUpdate(fixture.db, "wrong novel", "chapter", {
    content: "overwrite", expectedContent: "AI revision",
  }), { statusCode: 404 });
  await assert.rejects(persistChapterUpdate(fixture.db, "novel", "chapter", {
    content: "overwrite", expectedContent: "old", title: "stale title",
  }), { statusCode: 409 });
  assert.equal(fixture.read().content, "AI revision");
  assert.equal(fixture.read().title, "Title");
});

test("raw whitespace and null cannot be silently treated as equivalent sources", async () => {
  const fixture = store(null);
  await assert.rejects(persistChapterUpdate(fixture.db, "novel", "chapter", { content: "first", expectedContent: "" }), { statusCode: 409 });
  await persistChapterUpdate(fixture.db, "novel", "chapter", { content: "first  \n", expectedContent: null });
  await assert.rejects(persistChapterUpdate(fixture.db, "novel", "chapter", { content: "second", expectedContent: "first" }), { statusCode: 409 });
  assert.equal(fixture.read().content, "first  \n");
});

test("explicit rebased save remains conditional against a second remote change", async () => {
  const fixture = store("remote");
  await persistChapterUpdate(fixture.db, "novel", "chapter", { content: "remote again", expectedContent: "remote" });
  await assert.rejects(persistChapterUpdate(fixture.db, "novel", "chapter", { content: "my draft", expectedContent: "remote" }), { statusCode: 409 });
});
