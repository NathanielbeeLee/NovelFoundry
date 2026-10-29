const test = require("node:test");
const assert = require("node:assert/strict");
const { aiRevisionPreviewSchema, rewritePreviewSchema } = require("../dist/modules/novel/http/novelHttpSchemas.js");
const { NovelChapterEditorService } = require("../dist/services/novel/chapterEditor/NovelChapterEditorService.js");
const { normalizeChapterContent, splitParagraphsWithRanges, buildParagraphWindow, buildAnchorRangeFromParagraphBounds } = require("../dist/services/novel/chapterEditor/chapterEditorShared.js");
const { chapterEditorRewriteCandidateSchema } = require("../dist/prompting/prompts/novel/chapterEditor/rewriteCandidates.promptSchemas.js");
const { getRegisteredPromptAsset } = require("../dist/prompting/registry.js");
const { assertConsequenceRange } = require("../dist/services/novel/chapterEditor/consequences/domain/consequencePolicy.js");

const constraints = { keepFacts: true, keepPov: true, noUnauthorizedSetting: true, preserveCoreInfo: true };
const manuscript = "　　第一段  空格。\n\n\n😀 第二段。\n\n";

function previewService(runner) {
  return new NovelChapterEditorService({ loadContext: async () => ({
    chapter: { content: "saved prose must not replace an empty draft" },
    chapterPlan: null,
    latestStateSnapshot: null,
    macroContext: { mustKeepConstraints: [], activePlotThreads: [], worldConstraintSummary: "" },
  }) }, runner);
}

test("server editor paragraphs preserve exact LF text, blanks and half-open ranges", () => {
  const raw = manuscript.replaceAll("\n", "\r\n");
  assert.equal(normalizeChapterContent(raw), manuscript);
  const paragraphs = splitParagraphsWithRanges(raw);
  assert.deepEqual(paragraphs.map((paragraph) => paragraph.text), manuscript.split("\n"));
  for (const paragraph of paragraphs) assert.equal(manuscript.slice(paragraph.from, paragraph.to), paragraph.text);
  const fourth = paragraphs[3];
  assert.deepEqual(buildAnchorRangeFromParagraphBounds(paragraphs, 4, 4), { from: fourth.from, to: fourth.to });
  assert.deepEqual(buildParagraphWindow(manuscript, { from: fourth.from, to: fourth.to + 1 }), {
    beforeParagraphs: ["　　第一段  空格。", "", ""], afterParagraphs: ["", ""],
  });
});

test("both editor HTTP schemas preserve leading and trailing selection whitespace", () => {
  const selection = { from: 0, to: 7, text: "　 text " };
  const base = { source: "preset", scope: "selection", presetOperation: "polish", contentSnapshot: "　 text \n", selection, context: { beforeParagraphs: [], afterParagraphs: [] }, constraints };
  assert.deepEqual(aiRevisionPreviewSchema.parse(base).selection, selection);
  const legacy = { operation: "polish", contentSnapshot: base.contentSnapshot, targetRange: selection, constraints, context: { beforeParagraphs: [], afterParagraphs: [] }, chapterContext: {} };
  assert.deepEqual(rewritePreviewSchema.parse(legacy).targetRange, selection);
  assert.equal(aiRevisionPreviewSchema.safeParse({ ...base, selection: { ...selection, text: " \n " } }).success, false);
});

test("candidate schema preserves manuscript bytes while rejecting whitespace-only output", () => {
  assert.equal(chapterEditorRewriteCandidateSchema.parse({ label: "A", content: manuscript }).content, manuscript);
  assert.equal(chapterEditorRewriteCandidateSchema.safeParse({ label: "A", content: " \n " }).success, false);
  assert.equal(getRegisteredPromptAsset("novel.chapter_editor.rewrite_candidates", "v3").version, "v3");
});

test("revision preview retains selected whitespace, candidate bytes and reversible diffs", async () => {
  const selected = "😀 第二段。\n";
  const from = manuscript.indexOf("😀");
  const replacement = "　候选  \n\n";
  let captured;
  const service = previewService(async ({ promptInput }) => {
    captured = promptInput;
    return { output: { candidates: [{ label: "A", content: replacement }, { label: "B", content: "  另一版 \n" }] } };
  });
  const request = aiRevisionPreviewSchema.parse({ source: "preset", scope: "selection", presetOperation: "polish", contentSnapshot: manuscript, selection: { from, to: from + selected.length, text: selected }, context: buildParagraphWindow(manuscript, { from, to: from + selected.length }), constraints });
  const result = await service.previewAiRevision("book", "chapter", request);
  assert.equal(captured.selectedText, selected);
  assert.deepEqual(captured.beforeParagraphs, ["　　第一段  空格。", "", ""]);
  assert.equal(result.targetRange.text, selected);
  assert.equal(result.candidates[0].content, replacement);
  assert.equal(result.candidates[0].diffChunks.filter((chunk) => chunk.type !== "insert").map((chunk) => chunk.text).join(""), selected);
  assert.equal(result.candidates[0].diffChunks.filter((chunk) => chunk.type !== "delete").map((chunk) => chunk.text).join(""), replacement);
  const applied = assertConsequenceRange({ contentSnapshot: manuscript, targetRange: result.targetRange, candidate: result.candidates[0] });
  assert.equal(applied, manuscript.slice(0, from) + replacement + manuscript.slice(from + selected.length));
});

test("an empty unsaved manuscript never falls back to persisted prose for AI revision", async () => {
  let calls = 0;
  const service = previewService(async () => { calls += 1; throw new Error("Unexpected model request"); });
  await assert.rejects(() => service.previewAiRevision("book", "chapter", { source: "preset", scope: "chapter", presetOperation: "polish", contentSnapshot: "", constraints }), /正文为空/);
  assert.equal(calls, 0);
});

test("stale or trimmed selected bytes cannot silently choose a different passage", async () => {
  let calls = 0;
  const service = previewService(async () => { calls += 1; throw new Error("Unexpected model request"); });
  await assert.rejects(() => service.previewAiRevision("book", "chapter", { source: "preset", scope: "selection", presetOperation: "polish", contentSnapshot: "  passage  ", selection: { from: 0, to: 11, text: "passage" }, constraints }), /选中文本已发生变化/);
  assert.equal(calls, 0);
});
