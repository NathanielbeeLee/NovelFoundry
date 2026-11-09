const test = require("node:test");
const assert = require("node:assert/strict");

const { chapterWriterPrompt } = require("../dist/prompting/prompts/novel/chapterWriter.prompts.js");
const { getRegisteredPromptAsset } = require("../dist/prompting/registry.js");
const {
  getOfficialPromptTemplate,
  getOfficialPromptTemplateVersion,
} = require("../dist/prompting/templates/officialTemplates.js");

function renderWriter(mode) {
  return chapterWriterPrompt.render({
    novelTitle: "灯下归人",
    chapterOrder: 4,
    chapterTitle: "雨停之前",
    mode,
    targetWordCount: 3000,
    minWordCount: 2550,
    maxWordCount: 3450,
    missingWordGap: mode === "continue" ? 400 : null,
  }, {
    blocks: [],
    selectedBlockIds: [],
    droppedBlockIds: [],
    summarizedBlockIds: [],
    estimatedInputTokens: 0,
  }).map((message) => String(message.content)).join("\n");
}

function assertSceneGuidance(text) {
  assert.match(text, /过渡、停顿和后果消化可以单独成段/);
  assert.doesNotMatch(text, /每一段叙述尽量同时完成两项以上/);
  assert.match(text, /影响人物眼前的感知、行动或压力/);
  assert.match(text, /有作用时保留，与当前情境无关时从事件切入/);
  assert.match(text, /不得引入新的核心角色、世界规则或与上下文冲突的重大设定/);
  assert.match(text, /obligation contract/);
  assert.match(text, /character_hard_facts/);
  assert.match(text, /不得大段复述已发生事件/);
  assert.match(text, /禁止靠重复回顾、空泛心理独白、无信息量描写硬凑字数/);
}

test("scene-dependent writer guidance retains chapter scope, length and continuation contracts", () => {
  for (const mode of ["draft", "continue"]) {
    const text = renderWriter(mode);
    assertSceneGuidance(text);
    assert.match(text, /本章目标长度：约 3000 字/);
    assert.match(text, /可接受区间：2550-3450 字/);
    assert.match(text, /reader_experience 是本章读者体验硬合同/);
    assert.match(text, /必须发生实质变化/);
    assert.doesNotMatch(text, /想用天气\/环境渲染开场 -> 改为从已经发生的事件直接切入/);
    if (mode === "continue") {
      assert.match(text, /必须无缝衔接现有结尾/);
      assert.match(text, /禁止重写开头/);
      assert.match(text, /仍至少缺少约 400 字/);
    }
  }
});

test("registered writer and official template share scene guidance without replacing required context", () => {
  assert.equal(chapterWriterPrompt.version, "v9");
  assert.equal(getRegisteredPromptAsset(chapterWriterPrompt.id, "v9"), chapterWriterPrompt);
  assert.equal(getOfficialPromptTemplateVersion(chapterWriterPrompt.id), "v9");
  const template = getOfficialPromptTemplate(chapterWriterPrompt.id);
  assert.ok(template);
  const text = template.messages.map((message) => message.content).join("\n");
  assertSceneGuidance(text);
  for (const group of [
    "book_contract", "chapter_mission", "reader_experience", "character_hard_facts",
    "obligation_contract", "volume_window", "participant_subset", "local_state", "style_contract",
  ]) {
    assert.ok(text.includes(`{{context.${group}}}`), `required context: ${group}`);
  }
  assert.match(text, /\{\{input\.minWordCount\}\}-\{\{input\.maxWordCount\}\}/);
  assert.match(text, /\{\{slot\.writer\.customConstraints\}\}/);
});
