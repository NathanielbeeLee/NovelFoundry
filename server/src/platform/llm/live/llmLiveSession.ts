import type { BaseMessage } from "@langchain/core/messages";
import type { PromptInvocationMeta } from "../../../prompting/core/promptTypes";
import { formatPromptLiveLabel } from "../../../prompting/promptCatalog";
import { llmLiveBroker, type LlmLiveSession } from "./LlmLiveBroker";

export function beginLlmLiveSession(input: {
  label: string;
  mode: "text" | "structured";
  promptMeta?: PromptInvocationMeta;
  provider?: string | null;
  model?: string | null;
  promptText?: string | null;
}): LlmLiveSession {
  const meta = input.promptMeta;
  return llmLiveBroker.begin({
    label: meta ? formatPromptLiveLabel(meta) : input.label,
    mode: input.mode,
    promptId: meta?.promptId ?? null,
    promptVersion: meta?.promptVersion ?? null,
    taskId: meta?.taskId ?? null,
    novelId: meta?.novelId ?? null,
    chapterId: meta?.chapterId ?? null,
    volumeId: meta?.volumeId ?? null,
    stage: meta?.stage ?? null,
    itemKey: meta?.itemKey ?? null,
    provider: input.provider ?? null,
    model: input.model ?? null,
    promptText: input.promptText ?? null,
  });
}

export function formatLivePrompt(messages: BaseMessage[]): string {
  return messages.map((message, index) => {
    const role = message._getType?.() ?? `message_${index + 1}`;
    const content = typeof message.content === "string" ? message.content : JSON.stringify(message.content);
    return `[${role}]\n${content}`;
  }).join("\n\n");
}
