import { z } from "zod";

export const styleRewritePreservationFindingSchema = z.object({
  category: z.enum(["fact", "relationship", "event_order", "foreshadowing", "certainty", "narrative_intent"]),
  change: z.enum(["added", "removed", "altered"]),
  originalExcerpt: z.string().trim().max(400),
  rewrittenExcerpt: z.string().trim().max(400),
  explanation: z.string().trim().min(1).max(500),
  suggestedAction: z.string().trim().min(1).max(300),
});

export const styleRewritePreservationSchema = z.object({
  status: z.enum(["preserved", "changed", "uncertain"]),
  coverage: z.enum(["complete", "partial"]),
  summary: z.string().trim().min(1).max(500),
  findings: z.array(styleRewritePreservationFindingSchema).max(8),
}).superRefine((review, ctx) => {
  if (review.status === "preserved" && (review.coverage !== "complete" || review.findings.length !== 0)) {
    ctx.addIssue({ code: "custom", message: "保真通过必须完成全文对照且没有剧情改动证据。" });
  }
  if (review.status === "changed" && review.findings.length === 0) {
    ctx.addIssue({ code: "custom", message: "剧情改动判断必须提供原文与修订稿的证据。" });
  }
  for (const finding of review.findings) {
    if (!finding.originalExcerpt && !finding.rewrittenExcerpt) {
      ctx.addIssue({ code: "custom", message: "每个问题至少需要一侧的原文引用。" });
    }
    if (finding.change === "altered" && (!finding.originalExcerpt || !finding.rewrittenExcerpt)) {
      ctx.addIssue({ code: "custom", message: "变更判断需要两侧的原文引用。" });
    }
    if (finding.change === "added" && !finding.rewrittenExcerpt) {
      ctx.addIssue({ code: "custom", message: "新增信息需要修订稿引用。" });
    }
    if (finding.change === "removed" && !finding.originalExcerpt) {
      ctx.addIssue({ code: "custom", message: "遗漏信息需要原文引用。" });
    }
  }
});

export type StyleRewritePreservationAssessment = z.infer<typeof styleRewritePreservationSchema>;
