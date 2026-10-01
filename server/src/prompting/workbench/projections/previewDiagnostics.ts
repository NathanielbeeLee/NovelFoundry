import { type PromptRunTrace } from "../../core/promptTypes";

import { preparePromptExecution } from "../../core/promptRunner";

import { ContextBroker } from "../../context/ContextBroker";

import { CUSTOM_SLOT_CONTEXT_GROUP } from "../../slots/slotResolution";

import { type UnknownPromptAsset, type PromptPreviewInput, type PromptCatalogItem } from "../application/contracts";

export function buildPromptTracePreview(input: {
  asset: UnknownPromptAsset;
  prepared: ReturnType<typeof preparePromptExecution>;
  options: Pick<PromptPreviewInput, "executionContext">;
}): PromptRunTrace {
  return {
    promptId: input.asset.id,
    promptVersion: input.asset.version,
    taskType: input.asset.taskType,
    contextBlockIds: input.prepared.context.selectedBlockIds,
    droppedContextBlockIds: input.prepared.context.droppedBlockIds,
    summarizedContextBlockIds: input.prepared.context.summarizedBlockIds,
    customAddendumBlockIds: input.prepared.context.selectedBlockIds.filter((id) => id.startsWith(`${CUSTOM_SLOT_CONTEXT_GROUP}:`)),
    estimatedInputTokens: input.prepared.context.estimatedInputTokens,
    repairUsed: false,
    repairAttempts: 0,
    semanticRetryUsed: false,
    semanticRetryAttempts: 0,
    entrypoint: input.options.executionContext.entrypoint,
    novelId: input.options.executionContext.novelId,
    chapterId: input.options.executionContext.chapterId,
    taskId: input.options.executionContext.taskId,
  };
}

export function buildPreviewNotes(input: {
  prompt: PromptCatalogItem;
  brokerResolution: Awaited<ReturnType<ContextBroker["resolve"]>>;
  extraNotes?: string[];
}): string[] {
  const notes: string[] = [...(input.extraNotes ?? [])];
  if (!input.prompt.slotSupported) {
    notes.push("该提示词没有声明可编辑槽位，不能保存槽位覆盖。");
  }
  if (input.brokerResolution.missingRequiredGroups.length > 0) {
    notes.push(`缺少必需上下文组：${input.brokerResolution.missingRequiredGroups.join("、")}。`);
  }
  if (input.brokerResolution.resolverErrors.length > 0) {
    notes.push("部分上下文解析器返回错误。");
  }
  if (input.prompt.contextRequirements.length === 0) {
    notes.push("该提示词没有声明上下文需求。");
  }
  return notes;
}

export function formatPreviewRenderError(error: unknown, asset: UnknownPromptAsset): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`提示词预览渲染失败（${asset.id}@${asset.version}）：${message}`);
}
