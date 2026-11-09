import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTO_DIRECTOR_CREATE_DRAFT_KEY,
  clearAutoDirectorCreateDraft,
  loadAutoDirectorCreateDraft,
  saveAutoDirectorCreateDraft,
} from "./autoDirectorCreateDraft.ts";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values,
  };
}

const defaults = { title: "", estimatedChapterCount: 80, postGenerationStyleReviewEnabled: true, continuationBookAnalysisSections: [] };

test("opening wizard draft restores idea, settings and the last unfinished step", () => {
  const storage = memoryStorage();
  saveAutoDirectorCreateDraft(storage, {
    idea: "城市每天重置，只有邮差记得昨日。",
    basicForm: { title: "昨日邮差", estimatedChapterCount: 120, postGenerationStyleReviewEnabled: false },
    activeStage: "model_run",
    completedStages: ["idea", "basic", "world_style"],
    runMode: "stage_review",
    worldSetupMode: "skip",
    selectedStyleProfileId: "style-1",
  });
  const draft = loadAutoDirectorCreateDraft(storage, defaults);
  assert.equal(draft.idea, "城市每天重置，只有邮差记得昨日。");
  assert.deepEqual(draft.basicForm, { title: "昨日邮差", estimatedChapterCount: 120, postGenerationStyleReviewEnabled: false });
  assert.equal(draft.activeStage, "model_run");
  assert.deepEqual(draft.completedStages, ["idea", "basic", "world_style"]);
  assert.equal(draft.runMode, "stage_review");
  assert.equal(draft.worldSetupMode, "skip");
  assert.equal(draft.selectedStyleProfileId, "style-1");

  clearAutoDirectorCreateDraft(storage);
  assert.equal(loadAutoDirectorCreateDraft(storage, defaults), null);
});

test("opening wizard draft ignores invalid saved values and empty drafts", () => {
  const storage = memoryStorage();
  storage.setItem(AUTO_DIRECTOR_CREATE_DRAFT_KEY, JSON.stringify({
    idea: "想法",
    basicForm: { title: 3, estimatedChapterCount: "很多", unknownField: "x", continuationBookAnalysisSections: [1] },
    activeStage: "candidates",
    completedStages: ["idea", "candidates", "bogus"],
    runMode: "retired_mode",
    worldSetupMode: "import",
    selectedStyleProfileId: 7,
  }));
  const draft = loadAutoDirectorCreateDraft(storage, defaults);
  assert.deepEqual(draft.basicForm, {});
  assert.equal(draft.activeStage, "idea");
  assert.deepEqual(draft.completedStages, ["idea"]);
  assert.equal(draft.runMode, null);
  assert.equal(draft.worldSetupMode, "auto_generate");
  assert.equal(draft.selectedStyleProfileId, "");

  storage.setItem(AUTO_DIRECTOR_CREATE_DRAFT_KEY, "{not json");
  assert.equal(loadAutoDirectorCreateDraft(storage, defaults), null);

  saveAutoDirectorCreateDraft(storage, {
    idea: "  ", basicForm: {}, activeStage: "idea", completedStages: [],
    runMode: null, worldSetupMode: "auto_generate", selectedStyleProfileId: "",
  });
  assert.equal(storage.values.has(AUTO_DIRECTOR_CREATE_DRAFT_KEY), false);
});
