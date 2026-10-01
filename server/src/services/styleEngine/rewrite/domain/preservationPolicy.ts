import type {
  StyleRewritePreservationResult,
  StyleRewriteUnverifiedReason,
} from "@novelfoundry/shared/types/styleEngine";

// Resource bounds for a complete pair, not heuristics for prose quality.
export const STYLE_REWRITE_PRESERVATION_MAX_COMBINED_CHARS = 24_000;
export const STYLE_REWRITE_PRESERVATION_TIMEOUT_MS = 60_000;

const unverifiedSummaries: Record<StyleRewriteUnverifiedReason, string> = {
  model_uncertain: "AI 无法确认修文是否保留剧情，请对照原文后再采用。",
  incomplete_review: "AI 未完成全文对照，请保留原文，重新核验后再采用。",
  input_limit: "两份正文超过完整核验范围，请保留原文，选择较短的完整场景重新修文。",
  unavailable: "剧情保真检查未完成，请保留原文，稍后重新修文并核验。",
  invalid_result: "AI 没有返回可复查的保真结论，请保留原文并重新核验。",
  cancelled: "剧情保真检查被中断，请保留原文，重新核验后再采用。",
  timeout: "剧情保真检查超时，请保留原文，稍后重新修文并核验。",
};

export function unverifiedStyleRewritePreservation(
  reason: StyleRewriteUnverifiedReason,
): StyleRewritePreservationResult {
  return { status: "unverified", reason, summary: unverifiedSummaries[reason], findings: [] };
}
