import type { DirectorCandidate } from "@novelfoundry/shared/types/novelDirector";
import type { TitleFactorySuggestion } from "@novelfoundry/shared/types/title";
import { titleGenerationService } from "../../../../../title/TitleGenerationService";
import { isNearDuplicateTitle } from "../../../../../title/titleGeneration.shared";
import type { CandidateGenerationContext } from "../contracts/seedPayload";

export async function enhanceCandidateTitles(
  candidate: DirectorCandidate,
  context: CandidateGenerationContext,
  options: { excludedTitles?: string[] } = {},
): Promise<DirectorCandidate> {
  const excludedTitles = options.excludedTitles ?? [];
  const fallbackOptions = mergeTitleOptions([], candidate, excludedTitles);

  try {
    const response = await titleGenerationService.generateTitleIdeas({
      mode: "brief",
      brief: buildCandidateTitleBrief(candidate, context, excludedTitles),
      genreId: context.request.genreId ?? null,
      count: 4,
      provider: context.options.provider,
      model: context.options.model,
    });
    const mergedOptions = mergeTitleOptions(response.titles, candidate, excludedTitles);
    const primaryTitle = mergedOptions[0]?.title?.trim();
    return {
      ...candidate,
      workingTitle: primaryTitle || candidate.workingTitle,
      titleOptions: mergedOptions,
    };
  } catch {
    return {
      ...candidate,
      titleOptions: fallbackOptions,
    };
  }
}

function buildCandidateTitleBrief(
  candidate: DirectorCandidate,
  context: CandidateGenerationContext,
  excludedTitles: string[] = [],
): string {
  const lines = [
    `故事灵感：${context.idea.trim()}`,
    `方案定位：${candidate.positioning}`,
    `核心卖点：${candidate.sellingPoint}`,
    `主线冲突：${candidate.coreConflict}`,
    `主角路径：${candidate.protagonistPath}`,
    `开篇钩子：${candidate.hookStrategy}`,
    `推进循环：${candidate.progressionLoop}`,
    `结局方向：${candidate.endingDirection}`,
    candidate.toneKeywords.length > 0 ? `气质关键词：${candidate.toneKeywords.join("、")}` : "",
    context.request.title?.trim() ? `用户当前草拟标题：${context.request.title.trim()}` : "",
    `当前方案原始命名：${candidate.workingTitle}`,
    excludedTitles.length > 0 ? `其他方案已占用书名：${excludedTitles.join("、")}` : "",
    "请生成更适合中文网文封面展示和点击测试的书名，突出卖点、反差、异常规则、主角优势或追更钩子。",
    "不要写成策划案标题、世界观概念短语、流水线土味套壳名，也不要为了文艺感牺牲点击感。",
    excludedTitles.length > 0 ? "不得复用或近似改写其他方案已占用的书名。" : "",
  ].filter(Boolean);
  return lines.join("\n");
}

function mergeTitleOptions(
  generatedTitles: TitleFactorySuggestion[],
  candidate: DirectorCandidate,
  excludedTitles: string[] = [],
): TitleFactorySuggestion[] {
  const merged: TitleFactorySuggestion[] = [];
  for (const option of generatedTitles) {
    const conflictsWithExcluded = excludedTitles.some((title) => isNearDuplicateTitle(title, option.title));
    if (!conflictsWithExcluded && !merged.some((existing) => isNearDuplicateTitle(existing.title, option.title))) {
      merged.push(option);
    }
  }

  const originalOption = buildFallbackTitleOption(candidate);
  const originalConflictsWithExcluded = excludedTitles.some((title) => (
    isNearDuplicateTitle(title, originalOption.title)
  ));
  if (
    !originalConflictsWithExcluded
    && !merged.some((existing) => isNearDuplicateTitle(existing.title, originalOption.title))
  ) {
    merged.push(originalOption);
  }

  return merged.slice(0, 4);
}

export function selectDistinctCandidateTitle(
  candidate: DirectorCandidate,
  excludedTitles: string[],
): DirectorCandidate | null {
  const availableOptions: TitleFactorySuggestion[] = [];
  for (const option of candidate.titleOptions ?? []) {
    const conflictsWithExcluded = excludedTitles.some((title) => isNearDuplicateTitle(title, option.title));
    if (
      !conflictsWithExcluded
      && !availableOptions.some((existing) => isNearDuplicateTitle(existing.title, option.title))
    ) {
      availableOptions.push(option);
    }
  }

  const currentTitleAvailable = !excludedTitles.some((title) => (
    isNearDuplicateTitle(title, candidate.workingTitle)
  ));
  const selectedOption = currentTitleAvailable
    ? availableOptions.find((option) => isNearDuplicateTitle(option.title, candidate.workingTitle))
      ?? buildFallbackTitleOption(candidate)
    : availableOptions[0];
  if (!selectedOption) {
    return null;
  }

  return {
    ...candidate,
    workingTitle: selectedOption.title.trim(),
    titleOptions: [
      selectedOption,
      ...availableOptions.filter((option) => !isNearDuplicateTitle(option.title, selectedOption.title)),
    ].slice(0, 4),
  };
}

function buildFallbackTitleOption(candidate: DirectorCandidate): TitleFactorySuggestion {
  return {
    title: candidate.workingTitle,
    clickRate: 60,
    style: "high_concept",
    angle: "原始方案书名",
    reason: "沿用导演候选原始命名。",
  };
}
