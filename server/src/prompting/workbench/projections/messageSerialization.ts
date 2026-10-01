import type { BaseMessage } from "@langchain/core/messages";

import { preparePromptExecution } from "../../core/promptRunner";

import { type PromptPreviewMessage } from "../application/contracts";

export function messageContentToString(content: BaseMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
        return item.text;
      }
      return JSON.stringify(item);
    }).join("\n");
  }
  return JSON.stringify(content);
}

export function messageRole(message: BaseMessage): string {
  const candidate = message as BaseMessage & {
    _getType?: () => string;
    getType?: () => string;
  };
  if (typeof candidate._getType === "function") {
    return candidate._getType();
  }
  if (typeof candidate.getType === "function") {
    return candidate.getType();
  }
  return message.constructor.name;
}

export function serializeMessages(messages: BaseMessage[]): PromptPreviewMessage[] {
  return messages.map((message) => ({
    role: messageRole(message),
    content: messageContentToString(message.content),
  }));
}

export function serializePromptContext(context: ReturnType<typeof preparePromptExecution>["context"]) {
  return {
    blocks: context.blocks,
    selectedBlockIds: context.selectedBlockIds,
    droppedBlockIds: context.droppedBlockIds,
    summarizedBlockIds: context.summarizedBlockIds,
    estimatedInputTokens: context.estimatedInputTokens,
  };
}
