import { z } from "zod";
import { createHash } from "node:crypto";
import type { AuditType, ReviewIssue, ReviewEvidenceCalibration } from "@novelfoundry/shared/types/novel";
import { reviewIssueSchema } from "../../../../services/audit/auditSchemas";

export const manualAuditOutputSchema = z.object({
  score: z.object({
    coherence: z.number().min(0).max(100), repetition: z.number().min(0).max(100),
    pacing: z.number().min(0).max(100), voice: z.number().min(0).max(100),
    engagement: z.number().min(0).max(100), overall: z.number().min(0).max(100),
  }),
  issues: z.array(reviewIssueSchema.omit({ calibration: true }).extend({
    verdict: z.enum(["confirmed", "hypothesis", "deferred", "keep"]),
    excerpt: z.string().max(1600),
    startOffset: z.number().int().nonnegative().nullable().default(null),
    endOffset: z.number().int().nonnegative().nullable().default(null),
    readingImpact: z.string().max(800),
    counterEvidence: z.string().max(1200),
  })).max(12),
});

export function reviewContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

const auditTypes: Record<ReviewIssue["category"], AuditType> = {
  coherence: "continuity", logic: "character", repetition: "plot", pacing: "plot",
  voice: "mode_fit", engagement: "plot",
};

function groundQuote(content: string, quote: string, start: number | null, end: number | null): {
  grounding: ReviewEvidenceCalibration["grounding"]; start: number | null; end: number | null; reason: string;
} {
  if (!quote.trim()) return { grounding: "missing", start: null, end: null, reason: "没有可核对的原文引用。" };
  const splitsSurrogate = (offset: number) => offset > 0 && offset < content.length
    && content.charCodeAt(offset - 1) >= 0xd800 && content.charCodeAt(offset - 1) <= 0xdbff
    && content.charCodeAt(offset) >= 0xdc00 && content.charCodeAt(offset) <= 0xdfff;
  if (start !== null || end !== null) {
    const valid = start !== null && end !== null && end > start && end <= content.length
      && !splitsSurrogate(start) && !splitsSurrogate(end) && content.slice(start, end) === quote;
    return valid
      ? { grounding: "verified", start, end, reason: "已核对对应原文位置。" }
      : { grounding: "invalid", start, end, reason: "引用与指定的原文位置不一致。" };
  }
  const index = content.indexOf(quote);
  if (index < 0) return { grounding: "invalid", start: null, end: null, reason: "引用不在本次审稿正文中。" };
  if (splitsSurrogate(index) || splitsSurrogate(index + quote.length)) {
    return { grounding: "invalid", start: null, end: null, reason: "引用未覆盖完整字符，请核对原文。" };
  }
  if (content.indexOf(quote, index + 1) >= 0) return { grounding: "ambiguous", start: null, end: null, reason: "引用出现多次，需要确认具体位置。" };
  return { grounding: "verified", start: index, end: index + quote.length, reason: "已定位原文引用。" };
}

export function calibrateManualAudit(raw: z.infer<typeof manualAuditOutputSchema>, content: string, requestedTypes: string[]) {
  const sourceContentHash = reviewContentHash(content);
  const issues: ReviewIssue[] = raw.issues.map((item) => {
    const grounded = groundQuote(content, item.excerpt, item.startOffset, item.endOffset);
    const supported = grounded.grounding === "verified" && !!item.counterEvidence.trim() && !!item.readingImpact.trim();
    const verdict = item.verdict === "confirmed" && !supported ? "hypothesis" : item.verdict;
    const { verdict: _verdict, excerpt, startOffset: _start, endOffset: _end, readingImpact, counterEvidence, ...issue } = item;
    return { ...issue, calibration: {
      verdict, grounding: grounded.grounding, excerpt, startOffset: grounded.start, endOffset: grounded.end,
      readingImpact, counterEvidence, sourceContentHash, repairEligible: verdict === "confirmed" && supported,
      reason: !supported && grounded.grounding === "verified" ? "需要补充阅读影响或反证判断，再决定是否修改。" : grounded.reason,
    } };
  });
  return {
    score: raw.score,
    issues,
    auditReports: requestedTypes.map((type) => ({
      auditType: type as AuditType,
      summary: "结合原文引用与保留理由判断，待确认意见供作者参考。",
      issues: issues.flatMap((issue, index) => issue.calibration?.repairEligible && auditTypes[issue.category] === type ? [{
        severity: issue.severity, code: `manual_evidence_${index + 1}`, description: issue.evidence,
        evidence: issue.calibration.excerpt, fixSuggestion: issue.fixSuggestion,
      }] : []),
    })),
    manualReview: { sourceContentHash, issues },
  };
}
