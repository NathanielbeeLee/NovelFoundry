import { type PromptContextRequirement } from "../../core/promptTypes";

import { formatContextGroupLabel } from "../../context/contextGroupLabels";

import type { PromptSlotDef } from "../../slots/slotTypes";

import type { PromptTemplateReferenceItem } from "../../templates/templateTypes";

import { getRequiredTemplateContextGroups } from "../../templates/templateTypes";

export function buildPromptInputReferenceItems(promptId?: string): PromptTemplateReferenceItem[] {
  if (promptId === "novel.short_story.segment.write") {
    return [
      { key: "segment", label: "当前内部片段任务", token: "{{input.segment}}", group: "input" },
      { key: "previousContinuity", label: "前文连续性摘要", token: "{{input.previousContinuity}}", group: "input" },
      { key: "previousContentTail", label: "前文正文尾部", token: "{{input.previousContentTail}}", group: "input" },
    ];
  }
  return [
    { key: "novelTitle", label: "小说标题", token: "{{input.novelTitle}}", group: "input" },
    { key: "chapterOrder", label: "章节序号", token: "{{input.chapterOrder}}", group: "input" },
    { key: "chapterTitle", label: "章节标题", token: "{{input.chapterTitle}}", group: "input" },
    { key: "mode", label: "写作模式", token: "{{input.mode}}", group: "input" },
    { key: "targetWordCount", label: "目标字数", token: "{{input.targetWordCount}}", group: "input" },
    { key: "minWordCount", label: "最小字数", token: "{{input.minWordCount}}", group: "input" },
    { key: "maxWordCount", label: "最大字数", token: "{{input.maxWordCount}}", group: "input" },
    { key: "missingWordGap", label: "补写缺口", token: "{{input.missingWordGap}}", group: "input" },
  ];
}

export function buildSlotReferenceItems(slotDefs: PromptSlotDef[]): PromptTemplateReferenceItem[] {
  return slotDefs.map((slot) => ({
    key: slot.key,
    label: slot.label,
    description: slot.description,
    token: `{{slot.${slot.key}}}`,
    group: "slot",
  }));
}

export function buildContextReferenceItems(input: {
  requirements: PromptContextRequirement[];
  blocks: Array<{ group: string }>;
  promptId: string;
}): PromptTemplateReferenceItem[] {
  const previewGroups = new Set(input.blocks.map((block) => block.group));
  const requiredGroups = new Set([
    ...input.requirements.filter((requirement) => requirement.required).map((requirement) => requirement.group),
    ...getRequiredTemplateContextGroups(input.promptId),
  ]);
  return input.requirements
    .map((requirement) => ({
      key: requirement.group,
      label: formatContextGroupLabel(requirement.group),
      description: requirement.sourceHint,
      token: `{{context.${requirement.group}}}`,
      required: requiredGroups.has(requirement.group),
      hasPreviewBlock: previewGroups.has(requirement.group),
      group: requiredGroups.has(requirement.group) ? "required_context" as const : "optional_context" as const,
    }))
    .sort((left, right) => {
      if (left.group !== right.group) {
        return left.group === "required_context" ? -1 : 1;
      }
      return left.key.localeCompare(right.key);
    });
}
