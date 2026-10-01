import { randomUUID } from "node:crypto";
import type { BookSpec, DirectorCandidate, DirectorConfirmRequest, DirectorCorrectionPreset } from "@novelfoundry/shared/types/novelDirector";
import { DIRECTOR_CORRECTION_PRESETS } from "@novelfoundry/shared/types/novelDirector";
import type { BookContractDraft } from "@novelfoundry/shared/types/novelWorkflow";
import type { DirectorBookContractParsed } from "../contracts/schemas";
import { normalizeDirectorTargetChapterCount } from "./runMode";

export function normalizeCandidate(
  candidate: Omit<DirectorCandidate, "id"> & { id?: string },
  index: number,
): DirectorCandidate {
  return {
    id: randomUUID(),
    workingTitle: candidate.workingTitle.trim() || `方案 ${index + 1}`,
    titleOptions: [],
    logline: candidate.logline.trim(),
    positioning: candidate.positioning.trim(),
    sellingPoint: candidate.sellingPoint.trim(),
    coreConflict: candidate.coreConflict.trim(),
    protagonistPath: candidate.protagonistPath.trim(),
    endingDirection: candidate.endingDirection.trim(),
    hookStrategy: candidate.hookStrategy.trim(),
    progressionLoop: candidate.progressionLoop.trim(),
    whyItFits: candidate.whyItFits.trim(),
    recommendedWritingPlatform: candidate.recommendedWritingPlatform,
    writingPlatformReason: candidate.writingPlatformReason?.trim(),
    toneKeywords: Array.from(
      new Set(candidate.toneKeywords.map((item) => item.trim()).filter(Boolean)),
    ).slice(0, 4),
    targetChapterCount: normalizeDirectorTargetChapterCount(candidate.targetChapterCount),
  };
}

export function toBookSpec(
  candidate: DirectorCandidate,
  idea: string,
  overrideTargetChapterCount?: number,
): BookSpec {
  return {
    storyInput: idea.trim(),
    positioning: candidate.positioning.trim(),
    sellingPoint: candidate.sellingPoint.trim(),
    coreConflict: candidate.coreConflict.trim(),
    protagonistPath: candidate.protagonistPath.trim(),
    endingDirection: candidate.endingDirection.trim(),
    hookStrategy: candidate.hookStrategy.trim(),
    progressionLoop: candidate.progressionLoop.trim(),
    targetChapterCount: normalizeDirectorTargetChapterCount(
      overrideTargetChapterCount ?? candidate.targetChapterCount,
    ),
  };
}

export function buildRefinementSummary(
  presets: DirectorCorrectionPreset[],
  feedback: string | undefined,
  round: number,
): string | null {
  if (round === 1 && presets.length === 0 && !feedback?.trim()) {
    return null;
  }

  const presetSummary = presets.map((preset) => (
    DIRECTOR_CORRECTION_PRESETS.find((item) => item.value === preset)?.label ?? preset
  ));
  const fragments = [
    presetSummary.length > 0 ? `预设修正：${presetSummary.join("、")}` : "",
    feedback?.trim() ? `补充说明：${feedback.trim()}` : "",
  ].filter(Boolean);
  return fragments.join("；") || "按上一轮意见重新生成";
}

export function buildStoryInput(input: DirectorConfirmRequest, bookSpec: BookSpec): string {
  const lines = [
    input.idea.trim(),
    input.description?.trim() ? `补充概述：${input.description.trim()}` : "",
    input.targetAudience?.trim() ? `目标读者：${input.targetAudience.trim()}` : "",
    input.bookSellingPoint?.trim() ? `书级卖点：${input.bookSellingPoint.trim()}` : "",
    input.competingFeel?.trim() ? `对标气质：${input.competingFeel.trim()}` : "",
    input.first30ChapterPromise?.trim() ? `前30章承诺：${input.first30ChapterPromise.trim()}` : "",
    input.commercialTags && input.commercialTags.length > 0 ? `商业标签：${input.commercialTags.join("、")}` : "",
    input.genreId?.trim() ? `题材基底：${input.genreId.trim()}` : "",
    input.primaryStoryModeId?.trim() ? `主推进模式：${input.primaryStoryModeId.trim()}` : "",
    input.secondaryStoryModeId?.trim() ? `副推进模式：${input.secondaryStoryModeId.trim()}` : "",
    `确认方案：${input.candidate.workingTitle}`,
    `作品定位：${bookSpec.positioning}`,
    `核心卖点：${bookSpec.sellingPoint}`,
    `主线冲突：${bookSpec.coreConflict}`,
    `主角路径：${bookSpec.protagonistPath}`,
    `主钩子：${bookSpec.hookStrategy}`,
    `推进循环：${bookSpec.progressionLoop}`,
    `结局方向：${bookSpec.endingDirection}`,
    input.stepCalibrationInstruction?.trim()
      ? `当前步骤校准要求：${input.stepCalibrationInstruction.trim()}`
      : "",
  ].filter(Boolean);
  return lines.join("\n");
}

export function normalizeBookContract(parsed: DirectorBookContractParsed): BookContractDraft {
  return {
    readingPromise: parsed.readingPromise.trim(),
    protagonistFantasy: parsed.protagonistFantasy.trim(),
    coreSellingPoint: parsed.coreSellingPoint.trim(),
    chapter3Payoff: parsed.chapter3Payoff.trim(),
    chapter10Payoff: parsed.chapter10Payoff.trim(),
    chapter30Payoff: parsed.chapter30Payoff.trim(),
    escalationLadder: parsed.escalationLadder.trim(),
    relationshipMainline: parsed.relationshipMainline.trim(),
    absoluteRedLines: Array.from(
      new Set(parsed.absoluteRedLines.map((item) => item.trim()).filter(Boolean)),
    ).slice(0, 6),
  };
}
