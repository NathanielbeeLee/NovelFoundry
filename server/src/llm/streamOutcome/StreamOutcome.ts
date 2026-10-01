import type { LlmTokenUsageSnapshot } from "../usageTracking";

export type StreamFailureKind = "output_limit" | "interrupted" | "first_response_timeout" | "idle_timeout" | "deadline" | "cancelled";
export interface StrictStreamPolicy {
  requireTerminal: true;
  firstResponseTimeoutMs?: number;
  idleTimeoutMs?: number;
  totalTimeoutMs?: number;
}
export class StreamOutcomeError extends Error {
  constructor(
    readonly kind: StreamFailureKind,
    public partialContent = "",
    public tokenUsage: LlmTokenUsageSnapshot | null = null,
    options?: ErrorOptions,
  ) {
    super({ output_limit: "AI 输出达到单次长度上限，正文尚未完成。", interrupted: "AI 输出中断，未收到完成确认。", first_response_timeout: "等待 AI 首次响应超时。", idle_timeout: "AI 输出长时间没有进展。", deadline: "AI 生成超过本次时间上限。", cancelled: "AI 生成已取消。" }[kind], options);
    this.name = "StreamOutcomeError";
  }
}

export function isLlmInvocationCancelled(error: unknown): boolean {
  const seen = new Set<Error>();
  while (error instanceof Error && !seen.has(error)) {
    seen.add(error);
    if (error.name === "AbortError" || (error instanceof StreamOutcomeError && error.kind === "cancelled")) {
      return true;
    }
    error = error.cause;
  }
  return false;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}
export function readStreamTerminal(chunk: unknown): "success" | "output_limit" | "interrupted" | null {
  const value = record(chunk);
  const meta = record(value.response_metadata);
  const status = meta.status;
  if (status === "incomplete") {
    return record(meta.incomplete_details).reason === "max_output_tokens" ? "output_limit" : "interrupted";
  }
  if (status === "failed" || status === "cancelled") return "interrupted";
  if (status === "completed") return "success";
  const reason = meta.finish_reason ?? meta.stop_reason ?? record(meta.delta).stop_reason;
  if (reason === "length" || reason === "max_tokens") return "output_limit";
  if (reason === "stop" || reason === "end_turn" || reason === "stop_sequence") return "success";
  // Tool calls, refusals and unknown finish reasons are not a completed chapter.
  return typeof reason === "string" && reason ? "interrupted" : null;
}
