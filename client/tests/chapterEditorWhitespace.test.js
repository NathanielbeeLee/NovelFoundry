import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createPlateEditor } from "platejs/react";
import { createChapterDraft, editChapterDraft, acknowledgeChapterSave, receiveChapterContent, resolveChapterConflict } from "../src/pages/novels/components/chapterEditor/domain/chapterDraft.ts";

function sourceModule(path, replacements = {}) {
  let code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const [specifier, replacement] of Object.entries(replacements)) code = code.replaceAll(JSON.stringify(specifier), JSON.stringify(replacement));
  return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
}

const textModule = sourceModule("../../shared/types/novel/editor/text.ts");
const text = await import(textModule);
const utilsModule = sourceModule("../src/pages/novels/components/chapterEditor/chapterEditorUtils.ts", {
  "@novelfoundry/shared/types/novel": textModule,
});
const utils = await import(utilsModule);
const { ManuscriptParagraphPlugin } = await import(sourceModule("../src/pages/novels/components/chapterEditor/infrastructure/manuscriptParagraphPlugin.ts", {
  "platejs/react": import.meta.resolve("platejs/react"),
  "../chapterEditorUtils": utilsModule,
}));

for (const input of ["", "\n", "\n\n", "  ", "　　第一段  保留空格。\n\n\n\n第二段。\n\n", "首行\n次行\n", "\tA\r\n\r\n B  \r\n", "😀 一\n二\n\n", "孤立\r保持"]) {
  test(`manuscript round trip preserves whitespace: ${JSON.stringify(input)}`, () => {
    const normalized = input.replace(/\r\n/g, "\n");
    assert.equal(utils.normalizeChapterContent(input), normalized);
    assert.equal(utils.toPlainText(utils.toPlateValue(input)), normalized);
    assert.equal(utils.toPlateValue(input).length, normalized.split("\n").length);
  });
}

test("selection offsets include empty blocks, indentation, Unicode and nested leaves", () => {
  const value = [
    { type: "p", children: [{ text: "　😀  " }] },
    { type: "p", children: [{ text: "" }] },
    { type: "p", children: [{ text: "X " }, { children: [{ text: "Y  Z" }] }] },
  ];
  const selection = utils.buildSelectionRangeFromValue(value, {
    anchor: { path: [2, 1, 0], offset: 4 }, focus: { path: [0, 0], offset: 1 },
  });
  assert.equal(selection.from, 1);
  assert.equal(selection.to, 13);
  assert.equal(selection.text, utils.toPlainText(value).slice(1, 13));
  assert.deepEqual(utils.getParagraphIndicesForRange(utils.toPlainText(value), selection), { startIndex: 0, endIndex: 2 });
});

test("CRLF selection prefixes normalize once even across leaf boundaries", () => {
  const value = [{ type: "p", children: [{ text: "A\r" }, { text: "\n  B" }] }, { type: "p", children: [{ text: "C" }] }];
  const selected = utils.buildSelectionRangeFromValue(value, {
    anchor: { path: [0, 1], offset: 1 }, focus: { path: [1, 0], offset: 1 },
  });
  assert.deepEqual(selected, { from: 2, to: 7, text: "  B\nC" });
});

test("half-open paragraph windows preserve empty context and do not include the next block", () => {
  const content = "A\n\n  B\nC\n\n";
  assert.deepEqual(utils.getParagraphIndicesForRange(content, { from: 3, to: 7 }), { startIndex: 2, endIndex: 2 });
  assert.deepEqual(utils.getParagraphWindow(content, { from: 3, to: 7, text: "  B\n" }), { beforeParagraphs: ["A", ""], afterParagraphs: ["C", ""] });
  assert.equal(utils.getParagraphIndicesForRange(content, { from: 2, to: 2 }), null);
  assert.equal(utils.getParagraphIndicesForRange(content, { from: -1, to: 2 }), null);
});

test("AI request and replacement share exact text and do not change unselected whitespace", () => {
  const content = "　A  \n\n😀 B\n\n";
  const from = content.indexOf("😀");
  const selection = { from, to: from + 4, text: "😀 B" };
  const request = utils.buildAiRevisionRequest({ content, selection, scope: "selection", source: "preset", presetOperation: "polish" });
  assert.equal(request.contentSnapshot, content);
  assert.deepEqual(request.selection, selection);
  assert.equal(utils.applyCandidateToContent(content, selection, "　候选  "), "　A  \n\n　候选  \n\n");
});

test("headless Plate Enter and soft break both create one serializable newline", () => {
  const editor = createPlateEditor({ plugins: [ManuscriptParagraphPlugin], value: utils.toPlateValue("　A  ") });
  editor.tf.select({ path: [0, 0], offset: 4 });
  editor.tf.insertSoftBreak();
  assert.equal(editor.children.length, 2);
  assert.equal(utils.toPlainText(editor.children), "　A  \n");
  editor.tf.insertBreak();
  editor.tf.insertText(" B ");
  assert.equal(utils.toPlainText(editor.children), "　A  \n\n B ");
});

test("headless Plate multiline insertion and pasted fragments keep one block per LF", () => {
  const editor = createPlateEditor({ plugins: [ManuscriptParagraphPlugin], value: utils.toPlateValue("A") });
  editor.tf.select({ path: [0, 0], offset: 1 });
  editor.tf.insertText("\r\n  B\n\n");
  assert.equal(utils.toPlainText(editor.children), "A\n  B\n\n");
  assert.equal(editor.children.length, 4);
  editor.tf.insertFragment([{ type: "p", children: [{ text: "C\n D\n" }] }]);
  assert.equal(utils.toPlainText(editor.children), "A\n  B\n\nC\n D\n");
  assert.equal(editor.children.length, 6);
});

test("headless Plate inline fragment leaves concatenate without synthetic newlines", () => {
  const editor = createPlateEditor({ plugins: [ManuscriptParagraphPlugin], value: utils.toPlateValue("") });
  editor.tf.select({ path: [0, 0], offset: 0 });
  editor.tf.insertFragment([{ text: "　A " }, { text: " B  " }]);
  assert.equal(utils.toPlainText(editor.children), "　A  B  ");
  assert.equal(editor.children.length, 1);
  editor.tf.insertFragment([{ type: "p", children: [{ text: "" }] }, { type: "p", children: [{ text: "" }] }]);
  assert.equal(utils.toPlainText(editor.children), "　A  B  \n");
});

test("save receipts, refresh and conflict preserve whitespace edits and raw CAS identity", () => {
  const raw = "　A\r\n\r\nB  \r\n";
  let draft = createChapterDraft(utils.normalizeChapterContent(raw), raw);
  assert.equal(draft.sourceContent, raw);
  draft = editChapterDraft(draft, "　A\n\nB  \n\n");
  const submitted = draft.content;
  draft = editChapterDraft({ ...draft, status: "saving" }, submitted + "  ");
  draft = acknowledgeChapterSave(draft, submitted);
  draft = receiveChapterContent(draft, submitted, false, submitted);
  assert.equal(draft.content, submitted + "  ");
  assert.equal(draft.sourceContent, submitted);
  assert.notEqual(draft.content, draft.savedContent);
  const remote = "  remote\r\n\r\n";
  const loaded = resolveChapterConflict(draft, utils.normalizeChapterContent(remote), remote, false);
  assert.equal(loaded.content, "  remote\n\n");
  assert.equal(loaded.sourceContent, remote);
});
