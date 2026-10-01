import type {
  StyleRewritePreservationFinding,
  StyleRewritePreservationResult,
  StyleRewriteResult,
  StyleRewriteUnverifiedReason,
} from "@novelfoundry/shared/types/styleEngine";

const categories = new Set(["fact", "relationship", "event_order", "foreshadowing", "certainty", "narrative_intent"]);
const changes = new Set(["added", "removed", "altered"]);
const reasons = new Set(["model_uncertain", "incomplete_review", "input_limit", "unavailable", "invalid_result", "cancelled", "timeout"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFinding(value: unknown, original: string, rewritten: string): StyleRewritePreservationFinding | null {
  if (!isRecord(value)
    || typeof value.category !== "string" || !categories.has(value.category)
    || typeof value.change !== "string" || !changes.has(value.change)
    || typeof value.originalExcerpt !== "string" || typeof value.rewrittenExcerpt !== "string"
    || typeof value.explanation !== "string" || !value.explanation.trim()
    || typeof value.suggestedAction !== "string" || !value.suggestedAction.trim()) return null;

  const sourceExists = Boolean(value.originalExcerpt.trim());
  const candidateExists = Boolean(value.rewrittenExcerpt.trim());
  if ((!sourceExists && !candidateExists)
    || (!sourceExists && value.originalExcerpt.length > 0)
    || (!candidateExists && value.rewrittenExcerpt.length > 0)
    || (sourceExists && !original.includes(value.originalExcerpt))
    || (candidateExists && !rewritten.includes(value.rewrittenExcerpt))
    || (value.change === "added" && !candidateExists)
    || (value.change === "removed" && !sourceExists)
    || (value.change === "altered" && (!sourceExists || !candidateExists))) return null;

  return {
    category: value.category as StyleRewritePreservationFinding["category"],
    change: value.change as StyleRewritePreservationFinding["change"],
    originalExcerpt: value.originalExcerpt,
    rewrittenExcerpt: value.rewrittenExcerpt,
    explanation: value.explanation,
    suggestedAction: value.suggestedAction,
  };
}

function unverified(reason: StyleRewriteUnverifiedReason, findings: StyleRewritePreservationFinding[] = []): StyleRewritePreservationResult {
  return {
    status: "unverified",
    summary: "暂无法确认修订稿是否保留了原文的剧情信息，请继续保留原文并重试检查。",
    findings,
    reason,
  };
}

/** Legacy or malformed results must never become a preservation pass. */
export function readStyleRewritePreview(value: unknown, original: string): StyleRewriteResult {
  if (!isRecord(value) || typeof value.content !== "string" || !value.content.trim()) {
    throw new Error("修文没有返回可用正文，请重新生成修订稿。");
  }
  if (value.originalContent !== undefined && value.originalContent !== original) {
    throw new Error("修订稿对应的原文与本次输入不一致，请重新生成修订稿。");
  }

  const result = { content: value.content, originalContent: original };
  if (!isRecord(value.preservation)) return { ...result, preservation: unverified("unavailable") };

  const review = value.preservation;
  const rawFindings = Array.isArray(review.findings) ? review.findings : [];
  const findings = rawFindings.map((finding) => readFinding(finding, original, value.content as string))
    .filter((finding): finding is StyleRewritePreservationFinding => finding !== null);
  const validStatus = review.status === "preserved" || review.status === "changed" || review.status === "unverified";
  if (value.originalContent === undefined || !validStatus
    || typeof review.summary !== "string" || !review.summary.trim()
    || !Array.isArray(review.findings) || findings.length !== rawFindings.length
    || (review.status !== "unverified" && review.reason !== undefined)
    || (review.status === "preserved" && findings.length > 0)
    || (review.status === "changed" && findings.length === 0)) {
    return { ...result, preservation: unverified("invalid_result", findings) };
  }

  return {
    ...result,
    preservation: {
      status: review.status as StyleRewritePreservationResult["status"],
      summary: review.summary,
      findings,
      ...(typeof review.reason === "string" && reasons.has(review.reason)
        ? { reason: review.reason as StyleRewriteUnverifiedReason } : {}),
    },
  };
}
