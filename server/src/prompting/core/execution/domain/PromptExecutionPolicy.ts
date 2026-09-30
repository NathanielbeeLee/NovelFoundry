import { HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { toText } from "../../../../services/novel/novelP0Utils";
import { type PromptQualityFailureKind } from "../../promptQualityTelemetry";
import type { PromptAsset, PromptExecutionOptions, PromptRenderContext } from "../../promptTypes";

export function resolveStructuredRepairAttempts(asset: PromptAsset<unknown, unknown, unknown>): number {
  return Math.max(0, asset.repairPolicy?.maxAttempts ?? 1);
}

export function resolveStructuredRepairSourceTokenLimit(
  asset: PromptAsset<unknown, unknown, unknown>,
): number | undefined {
  const limit = asset.repairPolicy?.maxSourceTokens;
  return typeof limit === "number" && Number.isFinite(limit) && limit > 0
    ? Math.floor(limit)
    : undefined;
}

export function resolveStructuredSemanticRetryAttempts(asset: PromptAsset<unknown, unknown, unknown>): number {
  return Math.max(0, asset.semanticRetryPolicy?.maxAttempts ?? 0);
}

export function stringifyPromptError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }
  return String(error);
}

export function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

export function buildPromptCallOptions(options?: PromptExecutionOptions): Record<string, unknown> {
  const callOptions: Record<string, unknown> = {};
  if (options?.signal) {
    callOptions.signal = options.signal;
  }
  return callOptions;
}

export function estimateRenderedPromptChars(messages: BaseMessage[]): number {
  return messages.reduce((sum, message) => sum + toText(message.content).length, 0);
}

export function assertRenderedPromptWithinBudget(
  asset: PromptAsset<unknown, unknown, unknown>,
  renderedPromptChars: number,
): void {
  const limit = asset.maxRenderedInputTokens;
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
    return;
  }
  const estimatedTokens = Math.max(1, Math.ceil(renderedPromptChars / 3));
  if (estimatedTokens > limit) {
    throw new Error(
      `Prompt ${asset.id}@${asset.version} 完整输入预计 ${estimatedTokens} Tokens，超过 ${Math.floor(limit)} Tokens 的调用预算。`,
    );
  }
}

export function estimateOutputChars(output: unknown): number {
  if (typeof output === "string") {
    return output.length;
  }
  return safeJsonStringify(output).length;
}

export function isPromptOutputEmpty(output: unknown): boolean {
  return typeof output === "string" && output.trim().length === 0;
}

export function markPromptQualityFailure(error: unknown, failureKind: PromptQualityFailureKind): unknown {
  if (error && typeof error === "object") {
    try {
      Object.defineProperty(error, "promptQualityFailureKind", {
        value: failureKind,
        configurable: true,
      });
    } catch {
      // Ignore non-extensible errors.
    }
  }
  return error;
}

export function classifyPromptQualityFailure(error: unknown): PromptQualityFailureKind {
  const marked = error as { promptQualityFailureKind?: unknown };
  if (
    marked
    && typeof marked === "object"
    && (
      marked.promptQualityFailureKind === "llm_error"
      || marked.promptQualityFailureKind === "schema_repair_failed"
      || marked.promptQualityFailureKind === "post_validate_failed"
      || marked.promptQualityFailureKind === "empty_output"
      || marked.promptQualityFailureKind === "unknown"
    )
  ) {
    return marked.promptQualityFailureKind;
  }
  const message = stringifyPromptError(error).toLowerCase();
  if (message.includes("schema") || message.includes("json") || message.includes("zod") || message.includes("structured")) {
    return "schema_repair_failed";
  }
  if (message.includes("postvalidate") || message.includes("semantic")) {
    return "post_validate_failed";
  }
  return "llm_error";
}

export function buildDefaultSemanticRetryMessages<I, R>(input: {
  baseMessages: BaseMessage[];
  attempt: number;
  parsedOutput: R;
  validationError: string;
}): BaseMessage[] {
  return [
    ...input.baseMessages,
    new HumanMessage([
      `上一次输出虽然通过了 JSON 结构校验，但没有通过业务校验。这是第 ${input.attempt} 次语义重试。`,
      `失败原因：${input.validationError}`,
      "",
      "上一次的 JSON 输出：",
      safeJsonStringify(input.parsedOutput),
      "",
      "请基于同一任务重新生成完整 JSON 对象。",
      "硬要求：",
      "1. 只输出最终 JSON 对象。",
      "2. 不要输出 Markdown、解释、注释或额外文本。",
      "3. 必须修正上面的业务校验失败点。",
    ].join("\n")),
  ];
}

export function buildSemanticRetryMessages<I, O, R>(input: {
  asset: PromptAsset<I, O, R>;
  promptInput: I;
  context: PromptRenderContext;
  baseMessages: BaseMessage[];
  parsedOutput: R;
  validationError: string;
  attempt: number;
}): BaseMessage[] {
  return input.asset.semanticRetryPolicy?.buildMessages?.({
    promptId: input.asset.id,
    promptVersion: input.asset.version,
    attempt: input.attempt,
    promptInput: input.promptInput,
    context: input.context,
    baseMessages: input.baseMessages,
    parsedOutput: input.parsedOutput,
    validationError: input.validationError,
  }) ?? buildDefaultSemanticRetryMessages(input);
}

export function applyPromptPostValidate<I, O, R = O>(input: {
  asset: PromptAsset<I, O, R>;
  promptInput: I;
  context: PromptRenderContext;
  rawOutput: R;
}): O {
  return input.asset.postValidate
    ? input.asset.postValidate(input.rawOutput, input.promptInput, input.context)
    : input.rawOutput as unknown as O;
}

export function resolvePromptMaxTokens(
  asset: PromptAsset<unknown, unknown, unknown>,
  options?: PromptExecutionOptions,
): number | undefined {
  const cap = asset.maxOutputTokens;
  return typeof cap === "number" && Number.isFinite(cap) && cap > 0
    ? Math.min(options?.maxTokens ?? cap, cap)
    : options?.maxTokens;
}
