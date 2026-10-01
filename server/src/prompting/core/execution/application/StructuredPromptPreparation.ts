import { createHash } from "node:crypto";
import { toJSONSchema } from "zod";
import { mapStoredMessagesToChatMessages, type BaseMessage } from "@langchain/core/messages";
import { prepareStructuredLlmInvocation, type PreparedStructuredInvocation, type StructuredInvokeInput } from "../../../../llm/structuredInvoke";
import { resolveAdvancedPromptMessages } from "../../../templates/templateRuntime";
import { selectContextBlocks } from "../../contextSelection";
import { appendStructuredOutputHintMessages } from "../../structuredOutputHint";
import type { PromptAsset, PromptExecutionOptions, PromptInvocationMeta, PromptRenderContext } from "../../promptTypes";
import { preparePromptExecution, resolvePromptOverlaysForAsset } from "./PromptPreparation";
import { resolvePromptMaxTokens, resolveStructuredRepairAttempts, resolveStructuredRepairSourceTokenLimit } from "../domain/PromptExecutionPolicy";

export interface StructuredPromptExecutionInput<I, O, R = O> {
  asset: PromptAsset<I, O, R>;
  promptInput: I;
  contextBlocks?: Parameters<typeof selectContextBlocks>[0];
  options?: PromptExecutionOptions;
}

export interface RenderedStructuredPromptExecution<I, O, R = O> extends StructuredPromptExecutionInput<I, O, R> {
  messages: BaseMessage[];
  context: PromptRenderContext;
  invocation: PromptInvocationMeta;
}

export interface PreparedStructuredPromptExecution<I, O, R = O> extends RenderedStructuredPromptExecution<I, O, R> {
  preparedInvocation: PreparedStructuredInvocation;
  identityDigest: string | null;
}

export async function renderStructuredPromptExecution<I, O, R = O>(input: StructuredPromptExecutionInput<I, O, R>): Promise<RenderedStructuredPromptExecution<I, O, R>> {
  if (input.asset.mode !== "structured" || !input.asset.outputSchema) {
    throw new Error(`Prompt asset ${input.asset.id}@${input.asset.version} is not a structured prompt.`);
  }
  const overlays = await resolvePromptOverlaysForAsset({
    asset: input.asset as PromptAsset<unknown, unknown, unknown>, contextBlocks: input.contextBlocks, options: input.options,
  });
  const prepared = preparePromptExecution({ ...input, contextBlocks: overlays.blocks, resolvedSlots: overlays.resolvedSlots });
  const templateMessages = await resolveAdvancedPromptMessages({
    asset: input.asset, promptInput: input.promptInput, context: prepared.context,
    officialMessages: prepared.messages, novelId: input.options?.novelId,
  });
  const messages = templateMessages === prepared.messages ? prepared.messages : appendStructuredOutputHintMessages({
    asset: input.asset, promptInput: input.promptInput, context: prepared.context, messages: templateMessages,
  });
  return { ...input, ...prepared, messages, options: input.options ? { ...input.options } : undefined };
}

export function buildStructuredInvocationRequest<I, O, R>(prepared: RenderedStructuredPromptExecution<I, O, R>): StructuredInvokeInput<R> {
  const asset = prepared.asset as PromptAsset<unknown, unknown, unknown>;
  return {
    label: `${prepared.asset.id}@${prepared.asset.version}`, provider: prepared.options?.provider, model: prepared.options?.model,
    temperature: prepared.options?.temperature, reasoningEnabled: prepared.options?.reasoningEnabled,
    maxTokens: resolvePromptMaxTokens(asset, prepared.options), maxTokensCap: prepared.asset.maxOutputTokens,
    timeoutMs: prepared.options?.timeoutMs, signal: prepared.options?.signal, taskType: prepared.asset.taskType,
    messages: prepared.messages, schema: prepared.asset.outputSchema!,
    maxRepairAttempts: resolveStructuredRepairAttempts(asset), maxRepairSourceTokens: resolveStructuredRepairSourceTokenLimit(asset),
    promptMeta: prepared.invocation,
  };
}

export async function prepareStructuredPromptExecution<I, O, R = O>(input: StructuredPromptExecutionInput<I, O, R>): Promise<PreparedStructuredPromptExecution<I, O, R>> {
  // Prompt assets and caller payloads must not drift while an identity is reused.
  const snapshot = {
    ...input,
    asset: {
      ...input.asset,
      contextPolicy: structuredClone(input.asset.contextPolicy),
      contextRequirements: structuredClone(input.asset.contextRequirements),
      repairPolicy: structuredClone(input.asset.repairPolicy),
      slots: structuredClone(input.asset.slots),
      semanticRetryPolicy: input.asset.semanticRetryPolicy ? { ...input.asset.semanticRetryPolicy } : undefined,
    },
    promptInput: structuredClone(input.promptInput),
    contextBlocks: structuredClone(input.contextBlocks),
    options: input.options ? { ...input.options } : undefined,
  };
  const rendered = await renderStructuredPromptExecution(snapshot);
  const slotValues = Object.fromEntries((snapshot.asset.slots ?? []).map(({ key }) => [key, {
    text: rendered.context.slots?.text(key) ?? "", choiceCopy: rendered.context.slots?.choiceCopy(key) ?? "",
    enabled: rendered.context.slots?.enabled(key) ?? false, token: rendered.context.slots?.token(key) ?? "",
    append: rendered.context.slots?.append(key) ?? "",
  }]));
  const slots = rendered.context.slots ? {
    text: (key: string) => slotValues[key]?.text ?? "",
    choiceCopy: (key: string) => slotValues[key]?.choiceCopy ?? "",
    enabled: (key: string) => slotValues[key]?.enabled ?? false,
    token: (key: string) => slotValues[key]?.token ?? "",
    append: (key: string) => slotValues[key]?.append ?? "",
  } : undefined;
  const prepared = {
    ...rendered,
    context: { ...structuredClone({ ...rendered.context, slots: undefined }), slots },
    messages: mapStoredMessagesToChatMessages(structuredClone(rendered.messages.map((message) => message.toDict()))),
  };
  const preparedInvocation = await prepareStructuredLlmInvocation(buildStructuredInvocationRequest(prepared));
  let identityDigest: string | null = null;
  if (preparedInvocation.cacheable) {
    try {
      identityDigest = createHash("sha256").update(JSON.stringify({
        version: 1, promptId: prepared.asset.id, promptVersion: prepared.asset.version, taskType: prepared.asset.taskType,
        mode: prepared.asset.mode, schema: toJSONSchema(prepared.asset.outputSchema!, { io: "output" }),
        contextPolicy: prepared.asset.contextPolicy, contextRequirements: prepared.asset.contextRequirements,
        maxRenderedInputTokens: prepared.asset.maxRenderedInputTokens, maxOutputTokens: prepared.asset.maxOutputTokens,
        repairPolicy: prepared.asset.repairPolicy, semanticRetryAttempts: prepared.asset.semanticRetryPolicy?.maxAttempts ?? 0,
        promptInput: prepared.promptInput, context: prepared.context, slotValues,
        messages: prepared.messages.map((message) => message.toDict()),
        invocationIdentity: preparedInvocation.identityDigest,
      })).digest("hex");
    } catch {
      // An unrepresentable contract is usable for execution, but unsafe for reuse.
    }
  }
  return { ...prepared, preparedInvocation, identityDigest };
}
