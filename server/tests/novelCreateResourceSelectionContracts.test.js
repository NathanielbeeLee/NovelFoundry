const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const {
  novelCreateResourceRecommendationPrompt: resourcePrompt,
} = require("../dist/prompting/prompts/novel/resourceRecommendation.prompts.js");

const resourceInput = {
  userIntentSummary: "写一本城市冒险小说",
  genreCatalogText: "",
  storyModeCatalogText: "",
  allowedGenreIds: ["genre-city", "genre-fantasy"],
  allowedStoryModeIds: ["mode-mystery", "mode-growth"],
  genreCatalogOptions: [
    { id: "genre-city", name: "都市", path: "现代 / 都市" },
    { id: "genre-fantasy", name: "奇幻", path: "幻想 / 奇幻" },
  ],
  storyModeCatalogOptions: [
    { id: "mode-mystery", name: "解谜", path: "探索 / 解谜" },
    { id: "mode-growth", name: "成长", path: "人物 / 成长" },
  ],
};
const resourceOutput = {
  summary: "从城市谜案起步",
  genreId: "genre-city",
  genreReason: "符合城市背景",
  primaryStoryModeId: "mode-mystery",
  primaryStoryModeReason: "以解谜推进故事",
};

test("resource selections preserve exact IDs and canonical ordinal compatibility", () => {
  for (const genreId of ["genre-city", "  genre-city  ", "1"]) {
    const result = resourcePrompt.postValidate({ ...resourceOutput, genreId }, resourceInput);
    assert.equal(result.genreId, "genre-city");
  }
  // A literal ID takes priority even when it looks like an annotated label.
  const literalId = "都市（2）";
  const result = resourcePrompt.postValidate({ ...resourceOutput, genreId: literalId }, {
    ...resourceInput, allowedGenreIds: [literalId],
  });
  assert.equal(result.genreId, literalId);
});

test("resource selections resolve unique exact labels and consistent annotated ordinals", () => {
  for (const genreId of ["都市", "现代 / 都市", "都市（1）", "现代 / 都市 (1)"]) {
    const result = resourcePrompt.postValidate({
      ...resourceOutput, genreId, primaryStoryModeId: "解谜（1）",
      secondaryStoryModeId: "成长(2)", secondaryStoryModeReason: "辅以人物成长",
    }, resourceInput);
    assert.equal(result.genreId, "genre-city");
    assert.equal(result.primaryStoryModeId, "mode-mystery");
    assert.equal(result.secondaryStoryModeId, "mode-growth");
  }
});

test("resource selections reject unknown, conflicting and ambiguous labels instead of guessing", () => {
  for (const genreId of ["不存在（1）", "都市（2）", "都市(01)", "都市（1)", "都市（3）", "01", "现代/都市"]) {
    assert.throws(() => resourcePrompt.postValidate({ ...resourceOutput, genreId }, resourceInput), /非法 ID/);
  }
  const ambiguousInput = {
    ...resourceInput,
    genreCatalogOptions: resourceInput.genreCatalogOptions.map((option) => ({ ...option, name: "同名" })),
  };
  for (const genreId of ["同名", "同名（1）"]) {
    assert.throws(() => resourcePrompt.postValidate({ ...resourceOutput, genreId }, ambiguousInput), /非法 ID/);
  }
  assert.throws(() => resourcePrompt.postValidate({ ...resourceOutput, genreId: "未允许" }, {
    ...resourceInput,
    genreCatalogOptions: [{ id: "unlisted", name: "未允许", path: "未允许" }],
  }), /非法 ID/);
});

test("normalized secondary selection still enforces distinctness and a reason", () => {
  assert.throws(() => resourcePrompt.postValidate({
    ...resourceOutput, secondaryStoryModeId: "解谜（1）", secondaryStoryModeReason: "重复",
  }, resourceInput), /不能与主推进模式相同/);
  assert.throws(() => resourcePrompt.postValidate({
    ...resourceOutput, secondaryStoryModeId: "成长（2）", secondaryStoryModeReason: "",
  }, resourceInput), /推荐理由/);
});

test("resource recommendation records user and AI selection sources", () => {
  const shared = read("../shared/types/creation/novelResourceRecommendation.ts");
  const service = read("src/services/novel/NovelCreateResourceRecommendationService.ts");

  assert.match(shared, /"user_selected" \| "ai_recommended"/);
  assert.match(service, /source: selectedGenre \? "user_selected" : "ai_recommended"/);
  assert.match(service, /source: selectedPrimary \? "user_selected" : "ai_recommended"/);
  assert.match(service, /source: selectedSecondary \? "user_selected" : "ai_recommended"/);
});

test("AI secondary mode cannot duplicate the resolved primary mode", () => {
  const service = read("src/services/novel/NovelCreateResourceRecommendationService.ts");

  assert.match(service, /selectedGenre && selectedPrimary && selectedSecondary/);
  assert.match(service, /item\.id !== primary\?\.id/);
});

test("candidate workflow persists the resolved production foundation for recovery", () => {
  const stage = read("src/services/novel/director/phases/novelDirectorCandidateStage.ts");
  const directorTypes = read("../shared/types/director/session/candidates.ts");

  assert.match(directorTypes, /productionFoundation\?: NovelCreateResourceRecommendation/);
  assert.match(stage, /productionFoundation: foundation\.recommendation/);
});

test("idea inspiration prompt treats readable creation foundations as fixed constraints", () => {
  const service = read("src/services/novel/director/NovelDirectorIdeaInspirationService.ts");
  const prompt = read("src/prompting/prompts/novel/ideaInspiration.prompts.ts");
  const route = read("src/services/novel/director/http/novelDirector.ts");

  assert.match(service, /line\("主推进模式", input\.primaryStoryModeLabel/);
  assert.match(service, /line\("主推进说明", input\.primaryStoryModeDescription\)/);
  assert.match(route, /primaryStoryModeDescription: z\.string\(\)\.trim\(\)\.max\(1000\)\.optional\(\)/);
  assert.match(prompt, /用户确认的固定创作基础，五条想法都必须遵守/);
  assert.match(prompt, /不得通过更换已确认的题材与推进方式制造差异/);
});

test("idea inspirations bound creative sampling and retry with the original context", () => {
  const service = read("src/services/novel/director/NovelDirectorIdeaInspirationService.ts");
  const prompt = read("src/prompting/prompts/novel/ideaInspiration.prompts.ts");
  const schema = read("src/prompting/prompts/novel/ideaInspiration.promptSchemas.ts");
  const loaders = read("src/prompting/registry/promptAssetLoaderEntries.ts");

  assert.match(service, /Math\.min\(0\.8, Math\.max\(0\.55/);
  assert.match(service, /maxTokens: IDEA_INSPIRATION_MAX_TOKENS/);
  assert.match(service, /error instanceof StructuredOutputError && error\.category !== "transport_error"/);
  assert.match(service, /runIdeaInspirationPrompt\(input, IDEA_INSPIRATION_RETRY_TEMPERATURE\)/);
  assert.match(prompt, /version: "v3"/);
  assert.match(prompt, /maxAttempts: 0/);
  assert.match(prompt, /structuredOutputHint/);
  assert.match(schema, /z\.enum\(directorIdeaInspirationAngles\)/);
  assert.match(loaders, /novel\.director\.idea_inspiration@v3/);
});
