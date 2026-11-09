import assert from "node:assert/strict";
import test from "node:test";
import { getDirectionGenerationDisabledReasons } from "./generationReadiness.ts";

test("direction generation lists every unmet condition and accepts a ready opening", () => {
  assert.deepEqual(getDirectionGenerationDisabledReasons({ idea: "城市每天重置，只有邮差记得昨日。", isGenerating: false }), []);
  assert.deepEqual(getDirectionGenerationDisabledReasons({ idea: " \n ", isGenerating: true }), [
    "请返回第 1 步填写起始想法。",
    "正在生成整书方向，请等待本次生成完成。",
  ]);
});
