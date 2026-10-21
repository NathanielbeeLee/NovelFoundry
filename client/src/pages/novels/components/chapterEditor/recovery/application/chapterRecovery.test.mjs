import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { ChapterRecoverySession } from "./ChapterRecoverySession.ts";
import { ChapterRecoveryStore } from "../infrastructure/ChapterRecoveryStore.ts";
import { RECOVERY_MAX_RECORDS, RECOVERY_MAX_CHARACTERS, recoveryRecordKey, recoveryScopePrefix, recoveryIsOld } from "../domain/chapterRecovery.ts";
import { createChapterDraft, editChapterDraft, acknowledgeChapterSave } from "../../domain/chapterDraft.ts";

class MemoryStorage {
  rows = new Map();
  get length() { return this.rows.size; }
  key(index) { return [...this.rows.keys()][index] ?? null; }
  getItem(key) { return this.rows.get(key) ?? null; }
  setItem(key, value) { this.rows.set(key, value); }
  removeItem(key) { this.rows.delete(key); }
}
const scope = { novelId: "book:一", chapterId: "chapter/1" };
let sequence = 0;
const session = (store, selectedScope = scope) => new ChapterRecoverySession(selectedScope, store, () => 100_000, () => `test-${++sequence}`);
const dirty = (content, baseline = "source") => editChapterDraft(createChapterDraft(baseline ?? "", baseline), content);

test("navigation/refresh offers a complete copy without restoring or modifying saved prose", () => {
  const store = new ChapterRecoveryStore(() => new MemoryStorage());
  const storage = new MemoryStorage();
  const persistent = new ChapterRecoveryStore(() => storage);
  const first = session(persistent);
  const content = "未保存的完整正文\n\n最后一行  ";
  first.capture(dirty(content, "原始\r\n基线  "));
  const next = session(persistent);
  assert.deepEqual(next.snapshot().pending.map((record) => [record.content, record.baseline]), [[content, "原始\r\n基线  "]]);
  assert.equal(next.snapshot().protected, false);
  assert.deepEqual(session(store, { novelId: "other", chapterId: "1" }).snapshot().pending, []);
  assert.deepEqual(session(persistent, { ...scope, chapterId: "other" }).snapshot().pending, []);
  assert.deepEqual(session(persistent, { ...scope, novelId: "other" }).snapshot().pending, []);
});

test("null, empty and raw whitespace baselines stay distinct; empty draft content is protected", () => {
  const storage = new MemoryStorage();
  const store = new ChapterRecoveryStore(() => storage);
  session(store).capture(dirty("first", null));
  session(store).capture(dirty("second", ""));
  session(store).capture(dirty("", "content being deleted"));
  assert.deepEqual(store.read(scope).records.map((record) => record.baseline).sort(), [null, "", "content being deleted"].sort());
  assert.equal(store.read(scope).records.find((record) => record.content === "").baseline, "content being deleted");
});

for (const operation of ["ordinary save", "candidate adoption"]) {
  test(`${operation} receipt protects newer input and advances only its exact saved baseline`, () => {
    const storage = new MemoryStorage();
    const store = new ChapterRecoveryStore(() => storage);
    const active = session(store);
    let draft = dirty("submitted");
    const token = active.beginSave(draft);
    draft = editChapterDraft(draft, "new input while pending");
    active.capture(draft);
    const actualSaved = operation === "candidate adoption" ? "actual accepted candidate" : "submitted";
    active.acknowledge(token, actualSaved, draft.sourceContent);
    draft = acknowledgeChapterSave(draft, actualSaved);
    active.capture(draft);
    const [record] = store.read(scope).records;
    assert.equal(record.content, "new input while pending");
    assert.equal(record.baseline, actualSaved);
    assert.equal(store.read(scope).records.length, 1);
  });
}

test("acknowledged current version clears, while an unrelated chapter/session cannot be cleared", () => {
  const storage = new MemoryStorage();
  const store = new ChapterRecoveryStore(() => storage);
  const active = session(store);
  const token = active.beginSave(dirty("saved"));
  const other = session(store);
  other.capture(dirty("other window"));
  active.acknowledge(token, "saved", "source");
  assert.deepEqual(store.read(scope).records.map((record) => record.content), ["other window"]);
});

test("late receipt after navigation does not clear a restored new editor version", () => {
  const storage = new MemoryStorage();
  const store = new ChapterRecoveryStore(() => storage);
  const oldEditor = session(store);
  const token = oldEditor.beginSave(dirty("submitted"));
  const newEditor = session(store);
  newEditor.restore(newEditor.snapshot().pending[0]);
  newEditor.capture(dirty("new mount edits"));
  oldEditor.acknowledge(token, "submitted", "source");
  assert.deepEqual(store.read(scope).records.map((record) => record.content), ["new mount edits"]);
});

test("restore transfers the selected revision without changing its old baseline or another dirty draft", () => {
  const storage = new MemoryStorage();
  const store = new ChapterRecoveryStore(() => storage);
  session(store).capture(dirty("old recoverable", "old baseline\r\n"));
  const editor = session(store);
  const selected = editor.snapshot().pending[0];
  editor.capture(dirty("current dirty editor", "new remote baseline"));
  editor.restore(selected);
  const records = store.read(scope).records;
  assert.equal(records.length, 2);
  assert.equal(records.find((record) => record.content === "old recoverable").baseline, "old baseline\r\n");
  assert.ok(records.some((record) => record.content === "current dirty editor"));
});

test("another tab's newer immutable revision survives discarding a displayed older revision", () => {
  const storage = new MemoryStorage();
  const store = new ChapterRecoveryStore(() => storage);
  const first = session(store);
  first.capture(dirty("old"));
  const second = session(store);
  const displayed = second.snapshot().pending[0];
  first.capture(dirty("newer in original tab"));
  second.discard(displayed);
  assert.deepEqual(store.read(scope).records.map((record) => record.content), ["newer in original tab"]);
});

test("two tabs restoring one displayed revision retain independent full copies", () => {
  const storage = new MemoryStorage();
  const store = new ChapterRecoveryStore(() => storage);
  session(store).capture(dirty("shared starting text"));
  const first = session(store), second = session(store);
  const shownA = first.snapshot().pending[0], shownB = second.snapshot().pending[0];
  first.restore(shownA);
  first.capture(dirty("tab A"));
  second.restore(shownB);
  second.capture(dirty("tab B"));
  assert.deepEqual(store.read(scope).records.map((record) => record.content).sort(), ["tab A", "tab B"]);
});

test("an active tab re-protects unchanged text after another tab transfers its copy", () => {
  const storage = new MemoryStorage();
  const store = new ChapterRecoveryStore(() => storage);
  const first = session(store), second = session(store);
  const original = dirty("still active here");
  first.capture(original);
  second.restore(second.snapshot().pending[0]);
  assert.equal(first.snapshot().protected, false);
  first.capture(original); // Same action as the storage-event callback.
  assert.equal(first.snapshot().protected, true);
  assert.equal(store.read(scope).records.length, 2);
});

test("failed recovery transfer retains the original complete copy", () => {
  const storage = new MemoryStorage();
  const store = new ChapterRecoveryStore(() => storage);
  session(store).capture(dirty("unique recovered prose", null));
  const editor = session(store);
  const selected = editor.snapshot().pending[0];
  storage.setItem = () => { throw new Error("QuotaExceededError"); };
  editor.restore(selected);
  assert.deepEqual(store.read(scope).records, [selected]);
  assert.match(editor.snapshot().error, /暂不可用/);
});

test("thirty-day old copies remain available until explicit discard", () => {
  const storage = new MemoryStorage();
  const store = new ChapterRecoveryStore(() => storage);
  session(store).capture(dirty("old unique draft"));
  const record = store.read(scope).records[0];
  assert.equal(recoveryIsOld(record, record.updatedAt + 31 * 24 * 60 * 60 * 1000), true);
  assert.equal(store.read(scope).records[0].content, "old unique draft");
  session(store).discard(record);
  assert.equal(storage.length, 0);
});

test("capacity never evicts another chapter, and replacement keeps a complete current copy", () => {
  const storage = new MemoryStorage();
  const store = new ChapterRecoveryStore(() => storage);
  const sessions = [];
  for (let i = 0; i < RECOVERY_MAX_RECORDS; i++) {
    const active = session(store, { novelId: "book", chapterId: String(i) });
    active.capture(dirty(`unique ${i}`)); sessions.push(active);
  }
  const overflow = session(store);
  overflow.capture(dirty("not truncated or substituted"));
  assert.equal(storage.length, RECOVERY_MAX_RECORDS);
  assert.match(overflow.snapshot().error, /空间不足/);
  sessions[0].capture(dirty("updated complete draft"));
  assert.equal(store.read({ novelId: "book", chapterId: "0" }).records[0].content, "updated complete draft");
  assert.equal(storage.length, RECOVERY_MAX_RECORDS);
});

test("oversized text is rejected whole without deleting the prior device copy", () => {
  const storage = new MemoryStorage();
  const store = new ChapterRecoveryStore(() => storage);
  const active = session(store);
  active.capture(dirty("previous complete draft"));
  active.capture(dirty("长".repeat(RECOVERY_MAX_CHARACTERS)));
  assert.equal(store.read(scope).records[0].content, "previous complete draft");
  assert.match(active.snapshot().error, /空间不足/);
});

test("bad JSON and unsupported records stay intact and expose a recoverability warning", () => {
  const storage = new MemoryStorage();
  const brokenKey = `${recoveryScopePrefix(scope)}broken`;
  storage.setItem(brokenKey, "{not json, keep original bytes");
  const store = new ChapterRecoveryStore(() => storage);
  const active = session(store);
  assert.match(active.snapshot().error, /无法读取/);
  active.capture(dirty("new editor content"));
  assert.equal(storage.getItem(brokenKey), "{not json, keep original bytes");
  assert.equal(store.read(scope).records[0].content, "new editor content");
  const record = store.read(scope).records[0];
  const unknown = { ...record, version: 9, id: "future" };
  storage.setItem(recoveryRecordKey(unknown), JSON.stringify(unknown));
  assert.equal(store.read(scope).invalid, true);
});

test("disabled storage and write failures preserve input and existing copies without throwing", () => {
  const unavailable = new ChapterRecoveryStore(() => { throw new Error("SecurityError"); });
  const active = session(unavailable);
  assert.doesNotThrow(() => active.capture(dirty("in-memory prose")));
  assert.match(active.snapshot().error, /离开前请保存/);
  assert.equal(active.beginSave(dirty("in-memory prose")), null);
  const storage = new MemoryStorage();
  const store = new ChapterRecoveryStore(() => storage);
  const editor = session(store);
  editor.capture(dirty("protected original"));
  storage.setItem = () => { throw new Error("QuotaExceededError"); };
  editor.capture(dirty("new in-memory prose"));
  assert.equal(store.read(scope).records[0].content, "protected original");
  assert.match(editor.snapshot().error, /暂不可用/);
});

test("ordinary save sends only manuscript content and its CAS baseline, keeping recovery metadata on-device", async () => {
  const file = new URL("../../ChapterEditorShell.tsx", import.meta.url);
  const source = ts.createSourceFile(file.pathname, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let saveFunction;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "saveMutation") {
      const options = node.initializer.arguments[0];
      saveFunction = options.properties.find((property) => property.name?.getText(source) === "mutationFn").initializer.getText(source);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(saveFunction);
  const calls = [];
  const context = { chapter: { id: "chapter-id" }, novelId: "novel-id", updateNovelChapter: async (...args) => { calls.push(args); return { data: {} }; } };
  const compiled = ts.transpileModule(`globalThis.save = ${saveFunction}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(compiled, context);
  await context.save({ content: "prose", expectedContent: null, recovery: { content: "local-only prose", revision: "local-only revision", baseline: "local-only baseline" } });
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [["novel-id", "chapter-id", { content: "prose", expectedContent: null }]]);
});
