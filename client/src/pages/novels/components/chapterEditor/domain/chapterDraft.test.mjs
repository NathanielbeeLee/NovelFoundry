import test from "node:test";
import assert from "node:assert/strict";
import { createChapterDraft, editChapterDraft, acknowledgeChapterSave, receiveChapterContent } from "./chapterDraft.ts";

const startSave = (draft) => ({ ...draft, status: "saving" });

test("save acknowledgement and refetch preserve prose entered during the request", () => {
  let draft = startSave(editChapterDraft(createChapterDraft("original"), "submitted"));
  draft = editChapterDraft(draft, "submitted plus new prose");
  draft = acknowledgeChapterSave(draft, "submitted");
  draft = receiveChapterContent(draft, "submitted");
  assert.equal(draft.content, "submitted plus new prose");
  assert.equal(draft.savedContent, "submitted");
  assert.equal(draft.status, "idle");
});

test("a refetch arriving before acknowledgement cannot replace new prose", () => {
  let draft = startSave(editChapterDraft(createChapterDraft("original"), "submitted"));
  draft = editChapterDraft(draft, "newer");
  draft = receiveChapterContent(draft, "submitted");
  draft = acknowledgeChapterSave(draft, "submitted");
  draft = receiveChapterContent(draft, "submitted");
  assert.equal(draft.content, "newer");
  assert.equal(draft.pendingContent, undefined);
});

test("failure and remote refresh retain the unsaved draft", () => {
  let draft = startSave(editChapterDraft(createChapterDraft("original"), "draft"));
  draft = receiveChapterContent(draft, "other writer");
  draft = { ...draft, status: "error" };
  draft = receiveChapterContent(draft, "other writer");
  assert.equal(draft.content, "draft");
  assert.equal(draft.savedContent, "original");
  assert.equal(draft.status, "error");
});

test("clean editor receives server changes and dirty editor defers them until reverted", () => {
  assert.equal(receiveChapterContent(createChapterDraft("original"), "remote").content, "remote");
  let draft = receiveChapterContent(editChapterDraft(createChapterDraft("original"), "draft"), "remote");
  assert.equal(draft.content, "draft");
  draft = editChapterDraft(draft, "original");
  draft = receiveChapterContent(draft, "remote");
  assert.equal(draft.content, "remote");
});

test("save echo normalization does not replace local whitespace or mark it dirty", () => {
  let draft = acknowledgeChapterSave(editChapterDraft(createChapterDraft("original"), "submitted "), "submitted ");
  draft = receiveChapterContent(draft, "submitted", true);
  assert.equal(draft.content, "submitted ");
  assert.equal(draft.content, draft.savedContent);
  assert.equal(draft.status, "saved");
});

test("success does not revert to the pre-save query value before refetch", () => {
  const draft = acknowledgeChapterSave(editChapterDraft(createChapterDraft("original"), "saved"), "saved");
  assert.equal(receiveChapterContent(draft, "original").content, "saved");
});
