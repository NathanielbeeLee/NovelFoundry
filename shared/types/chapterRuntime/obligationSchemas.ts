import { z } from "zod";

export const chapterExecutionObligationKindSchema = z.enum([
  "must_hit_now",
  "must_preserve",
  "payoff_touch",
  "character_appearance",
  "goal_change",
  "forbidden_crossing",
]);

export const chapterExecutionObligationCoverageStatusSchema = z.enum([
  "satisfied",
  "partial",
  "unmet",
]);

export const chapterExecutionMissingObligationSchema = z.object({
  kind: chapterExecutionObligationKindSchema,
  summary: z.string(),
  evidence: z.string().nullable().optional(),
});

export const chapterExecutionObligationCoverageSchema = z.object({
  status: chapterExecutionObligationCoverageStatusSchema,
  missing: z.array(chapterExecutionMissingObligationSchema).default([]),
  summary: z.string(),
});

export const chapterFailureClassificationCodeSchema = z.enum([
  "none",
  "draft_generation_failed",
  "draft_obligation_unmet",
  "draft_repair_exhausted",
  "replan_required",
]);

export const chapterFailureClassificationSchema = z.object({
  code: chapterFailureClassificationCodeSchema,
  summary: z.string(),
  decisionReason: z.string().nullable().optional(),
  blockingObligations: z.array(chapterExecutionMissingObligationSchema).default([]),
});

export type ChapterExecutionObligationKind = z.infer<typeof chapterExecutionObligationKindSchema>;

export type ChapterExecutionMissingObligation = z.infer<typeof chapterExecutionMissingObligationSchema>;

export type ChapterExecutionObligationCoverage = z.infer<typeof chapterExecutionObligationCoverageSchema>;

export type ChapterFailureClassification = z.infer<typeof chapterFailureClassificationSchema>;
