/**
 * Lists every unmet condition for starting direction generation, so the
 * disabled button and its explanation come from the same check.
 */
export function getDirectionGenerationDisabledReasons(input: {
  idea: string;
  isGenerating: boolean;
}): string[] {
  const reasons: string[] = [];
  if (!input.idea.trim()) {
    reasons.push("请返回第 1 步填写起始想法。");
  }
  if (input.isGenerating) {
    reasons.push("正在生成整书方向，请等待本次生成完成。");
  }
  return reasons;
}
