import type { StyleExtractionDraft, StyleFeatureDecision } from "@novelfoundry/shared/types/styleEngine";

import { type PresetKey } from "./contracts";

export function parseTimeoutMs(rawValue: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number(rawValue ?? "");
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const value = Math.floor(parsed);
  return Math.max(min, Math.min(max, value));
}

export function stripStructuredOutputPrefix(message: string): string {
  return message.replace(/^\[STRUCTURED_OUTPUT:[a-z_]+\]\s*/iu, "").trim();
}

export function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const haystack = `${error.name} ${error.message}`.toLowerCase();
  return error.name === "TimeoutError" || /timed out|timeout|超时/u.test(haystack);
}

export function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const haystack = `${error.name} ${error.message}`.toLowerCase();
  return error.name === "AbortError" || /aborted|abort|中止/u.test(haystack);
}

export function normalizeTaskError(error: unknown): string {
  if (isTimeoutError(error)) {
    return "写法提取请求超时，模型长时间没有返回结果。可以在系统设置调高写法提取超时后重试，或切换更稳定的模型。";
  }
  if (isAbortError(error)) {
    return "写法提取已中止。";
  }
  if (error instanceof Error && error.message.trim()) {
    return stripStructuredOutputPrefix(error.message.trim());
  }
  return "写法提取任务失败，但没有记录到明确原因。";
}

export function buildExtractionDecisions(
  draft: StyleExtractionDraft,
  presetKey: PresetKey,
): Array<{ featureId: string; decision: StyleFeatureDecision }> {
  const preset = draft.presets.find((item) => item.key === presetKey);
  if (preset?.decisions?.length) {
    return preset.decisions;
  }
  return draft.features.map((feature) => ({
    featureId: feature.id,
    decision: "keep",
  }));
}
