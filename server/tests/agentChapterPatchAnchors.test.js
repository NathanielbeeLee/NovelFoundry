const test = require("node:test");
const assert = require("node:assert/strict");

function fixture(content) {
  const paths = {
    db: require.resolve("../dist/db/prisma.js"),
    services: require.resolve("../dist/services/novel/application/sharedNovelServices.js"),
    shared: require.resolve("../dist/agents/tools/shared.js"),
    tools: require.resolve("../dist/agents/tools/writeTools.js"),
  };
  const previous = new Map(Object.values(paths).map((path) => [path, require.cache[path]]));
  const writes = [];
  const chapter = { id: "chapter-1", novelId: "novel-1", content };
  try {
    require.cache[paths.db] = { exports: {
      prisma: { chapter: { findFirst: async () => chapter } },
    } };
    require.cache[paths.services] = { exports: {
      getSharedNovelServices: () => ({
        updateChapter: async (novelId, chapterId, input) => {
          writes.push({ novelId, chapterId, input });
          return { ...chapter, content: input.content, updatedAt: new Date(0) };
        },
      }),
    } };
    delete require.cache[paths.shared];
    delete require.cache[paths.tools];
    return {
      ...require(paths.shared),
      ...require(paths.tools),
      writes,
    };
  } finally {
    for (const [path, cached] of previous) {
      if (cached) require.cache[path] = cached;
      else delete require.cache[path];
    }
  }
}

const input = {
  novelId: "novel-1",
  chapterId: "chapter-1",
  mode: "replace_segment",
  marker: "旧段落",
  content: "新段落",
};

test("chapter patch replaces a unique exact excerpt and preserves literal replacement text", () => {
  const { buildPatchedContent } = fixture("");
  const replacement = "$& $` $' $$\n新的段落";
  assert.equal(buildPatchedContent("开头旧段落结尾", { ...input, content: replacement }),
    "开头" + replacement + "结尾");
  assert.equal(buildPatchedContent("旧段落\n第二行", { ...input, marker: "旧段落\n第二行" }),
    "新段落");
});

for (const [name, base, marker] of [
  ["missing", "当前正文", "旧段落"],
  ["repeated", "旧段落。旧段落。", "旧段落"],
  ["overlapping", "aaaa", "aaa"],
  ["blank", "正文", "  "],
]) {
  test(`chapter patch rejects ${name} anchors before preview or persistence`, async () => {
    const { buildPatchedContent, writeToolDefinitions, writes } = fixture(base);
    const patch = { ...input, marker };
    const invalid = (error) => error.name === "AgentToolError" && error.code === "INVALID_INPUT";
    assert.throws(() => buildPatchedContent(base, patch), invalid);
    await assert.rejects(writeToolDefinitions.diff_chapter_patch.execute({}, patch), invalid);
    for (const dryRun of [true, false]) {
      await assert.rejects(writeToolDefinitions.apply_chapter_patch.execute({}, { ...patch, dryRun }), invalid);
    }
    assert.deepEqual(writes, []);
  });
}

test("valid preview and dry run do not write; apply keeps the source-content precondition", async () => {
  const { writeToolDefinitions, writes } = fixture("开头旧段落结尾");
  const preview = await writeToolDefinitions.diff_chapter_patch.execute({}, input);
  assert.equal(preview.afterPreview, "开头新段落结尾");
  const dryRun = await writeToolDefinitions.apply_chapter_patch.execute({}, { ...input, dryRun: true });
  assert.equal(dryRun.afterPreview, preview.afterPreview);
  assert.deepEqual(writes, []);
  const applied = await writeToolDefinitions.apply_chapter_patch.execute({}, input);
  assert.equal(applied.afterPreview, preview.afterPreview);
  assert.deepEqual(writes, [{
    novelId: input.novelId,
    chapterId: input.chapterId,
    input: { content: "开头新段落结尾", expectedContent: "开头旧段落结尾" },
  }]);
});

test("explicit append and full replacement retain their existing contracts", () => {
  const { buildPatchedContent } = fixture("");
  assert.equal(buildPatchedContent("原文", { mode: "append", content: "续文" }), "原文\n\n续文");
  assert.equal(buildPatchedContent("原文", { mode: "full_replace", content: "新文" }), "新文");
});
