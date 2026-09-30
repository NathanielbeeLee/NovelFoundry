import { StreamExecutionScope, StreamOutcomeError } from "../../../../llm/streamOutcome";
import { type BaseMessageChunk } from "@langchain/core/messages";
import { beginLlmLiveSession, formatLivePrompt } from "../../../../platform/llm/live/llmLiveSession";
import { resolveAdvancedPromptMessages } from "../../../templates/templateRuntime";
import { selectContextBlocks } from "../../contextSelection";
import type { PromptAsset, PromptExecutionOptions, PromptRunResult, PromptStreamRunResult } from "../../promptTypes";
import { buildPromptInvocationMeta, resolvePromptOverlaysForAsset, preparePromptExecution } from "./PromptPreparation";
import { resolvePromptMaxTokens, assertRenderedPromptWithinBudget, buildPromptCallOptions, estimateRenderedPromptChars, applyPromptPostValidate } from "../domain/PromptExecutionPolicy";
import { promptRunnerLLMFactory } from "../infrastructure/PromptExecutionDependencies";
import { recordPromptFailure, buildPromptRunResult } from "../infrastructure/PromptExecutionTelemetry";
import { captureStreamOutput } from "../infrastructure/PromptStreamCapture";

export async function runTextPrompt<I>(input: {
  asset: PromptAsset<I, string, string>;
  promptInput: I;
  contextBlocks?: Parameters<typeof selectContextBlocks>[0];
  options?: PromptExecutionOptions;
}): Promise<PromptRunResult<string>> {
  const result = await streamTextPrompt(input);
  for await (const _chunk of result.stream) { /* consume the same monitored production path */ }
  return result.complete;
}

export async function streamTextPrompt<I>(input: {
  asset: PromptAsset<I, string, string>;
  promptInput: I;
  contextBlocks?: Parameters<typeof selectContextBlocks>[0];
  options?: PromptExecutionOptions;
}): Promise<PromptStreamRunResult<string>> {
  if (input.asset.mode !== "text") {
    throw new Error(`Prompt asset ${input.asset.id}@${input.asset.version} is not a text prompt.`);
  }

  const overlays = await resolvePromptOverlaysForAsset({
    asset: input.asset as PromptAsset<unknown, unknown, unknown>,
    contextBlocks: input.contextBlocks,
    options: input.options,
  });
  const prepared = preparePromptExecution({
    ...input,
    contextBlocks: overlays.blocks,
    resolvedSlots: overlays.resolvedSlots,
  });
  const startedAt = Date.now();
  const messages = await resolveAdvancedPromptMessages({
    asset: input.asset,
    promptInput: input.promptInput,
    context: prepared.context,
    officialMessages: prepared.messages,
    novelId: input.options?.novelId,
  });
  const renderedPromptChars = estimateRenderedPromptChars(messages);
  const liveSession = beginLlmLiveSession({
    label: input.asset.id + "@" + input.asset.version,
    mode: "text",
    promptMeta: prepared.invocation,
    provider: input.options?.provider,
    model: input.options?.model,
    promptText: formatLivePrompt(messages),
  });
  let captured: ReturnType<typeof captureStreamOutput>;
  const scope = input.options?.streamPolicy ? new StreamExecutionScope(input.options.streamPolicy, input.options.signal) : undefined;
  try {
    assertRenderedPromptWithinBudget(input.asset as PromptAsset<unknown, unknown, unknown>, renderedPromptChars);
    const llm = await promptRunnerLLMFactory(input.options?.provider, {
      fallbackProvider: "deepseek",
      model: input.options?.model,
      temperature: input.options?.temperature,
      reasoningEnabled: input.options?.reasoningEnabled,
      maxTokens: resolvePromptMaxTokens(input.asset as PromptAsset<unknown, unknown, unknown>, input.options),
      timeoutMs: input.options?.timeoutMs,
      ...(scope ? { maxRetries: 0 } : {}),
      taskType: input.asset.taskType,
      promptMeta: prepared.invocation,
    });
    liveSession.phase("streaming", "模型正在返回内容");
    const callOptions = { ...buildPromptCallOptions(input.options), ...(scope ? { signal: scope.signal, options: { maxRetries: 0 } } : {}) };
    scope?.signal.throwIfAborted();
    const pendingStream = llm.stream(messages, callOptions);
    const rawStream = scope ? await scope.race(pendingStream) : await pendingStream;
    captured = captureStreamOutput(rawStream as AsyncIterable<BaseMessageChunk>, (content) => liveSession.delta(content), (reasoning) => liveSession.reasoning(reasoning), scope);
  } catch (error) {
    scope?.dispose();
    liveSession.fail(error);
    recordPromptFailure({
      asset: input.asset as PromptAsset<unknown, unknown, unknown>,
      context: prepared.context,
      invocation: prepared.invocation,
      provider: input.options?.provider,
      model: input.options?.model,
      latencyMs: Date.now() - startedAt,
      renderedPromptChars,
      error,
    });
    throw error;
  }

  const complete = captured.completedText.then(async (content) => {
    liveSession.phase("validating", "正在整理生成结果");
    const output = applyPromptPostValidate({
      asset: input.asset,
      promptInput: input.promptInput,
      context: prepared.context,
      rawOutput: content,
    });
    const result = buildPromptRunResult({
      asset: input.asset as PromptAsset<unknown, unknown, unknown>,
      output,
      context: prepared.context,
      provider: input.options?.provider,
      model: input.options?.model,
      latencyMs: Date.now() - startedAt,
      invocation: buildPromptInvocationMeta(
        input.asset as PromptAsset<unknown, unknown, unknown>,
        prepared.context,
        false,
        0,
        false,
        0,
        input.options,
      ),
      renderedPromptChars,
      tokenUsage: await captured.completedUsage.catch(() => null),
    });
    liveSession.usage(result.meta.tokenUsage ? { ...result.meta.tokenUsage, reasoningTokens: result.meta.tokenUsage.reasoningTokens ?? null } : null);
    liveSession.complete();
    return result;
  }).catch((error) => {
    if (error instanceof StreamOutcomeError) liveSession.usage(error.tokenUsage ? { ...error.tokenUsage, reasoningTokens: error.tokenUsage.reasoningTokens ?? null } : null);
    liveSession.fail(error);
    recordPromptFailure({
      asset: input.asset as PromptAsset<unknown, unknown, unknown>,
      context: prepared.context,
      invocation: prepared.invocation,
      provider: input.options?.provider,
      model: input.options?.model,
      latencyMs: Date.now() - startedAt,
      renderedPromptChars,
      error,
    });
    throw error;
  });
  void complete.catch(() => undefined);
  return {
    stream: captured.stream,
    complete,
    context: prepared.context,
    invocation: prepared.invocation,
  };
}
