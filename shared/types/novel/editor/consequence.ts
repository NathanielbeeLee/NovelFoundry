import { z } from "zod";
import type { LLMProvider } from "../../llm.js";

export const chapterEditorConsequenceRequestSchema = z.object({
  sessionId: z.string().min(1).max(100),
  candidate: z.object({ id: z.string().min(1).max(100), content: z.string().min(1).max(100000) }).strict(),
  contentSnapshot: z.string().min(1).max(100000),
  expectedContent: z.string().max(1000000).nullable(),
  targetRange: z.object({ from: z.number().int().nonnegative(), to: z.number().int().positive(), text: z.string().min(1).max(100000) }).strict(),
  provider: z.custom<LLMProvider>((value) => typeof value === "string" && value.length > 0 && value.length <= 100).optional(),
  model: z.string().min(1).max(200).optional(),
}).strict();

const quoteSchema = z.string().min(1).max(1200).refine((text) => text.trim().length > 0, "Evidence quotes must contain non-whitespace text.");
export const chapterEditorConsequenceAssessmentSchema = z.object({
  summary: z.string().min(1).max(1200),
  recommendation: z.enum(["keep_candidate", "review_local_followup", "insufficient_evidence"]),
  findings: z.array(z.object({
    kind: z.enum(["conflict", "possible_effect"]),
    confidence: z.enum(["supported", "uncertain"]),
    summary: z.string().min(1).max(300),
    reason: z.string().min(1).max(1200),
    currentQuote: quoteSchema,
    candidateQuote: quoteSchema,
    dependencies: z.array(z.object({ refId: z.string().min(1).max(180), quote: quoteSchema }).strict()).max(8),
    suggestedAction: z.string().min(1).max(800),
  }).strict()).max(6),
  uncertainties: z.array(z.string().min(1).max(600)).max(6),
}).strict();

export type ChapterEditorConsequenceRequest = z.infer<typeof chapterEditorConsequenceRequestSchema>;
export type ChapterEditorConsequenceAssessment = z.infer<typeof chapterEditorConsequenceAssessmentSchema>;
export interface ChapterEditorConsequenceSource { refId: string; label: string; chapterOrder?: number; }
export interface ChapterEditorConsequenceReport extends ChapterEditorConsequenceAssessment {
  receipt: string;
  expiresAt: string;
  sources: ChapterEditorConsequenceSource[];
  prompt: { id: string; version: string; provider: string; model: string };
}
export type ChapterEditorConsequenceAdoptRequest = ChapterEditorConsequenceRequest & { receipt: string };
export const chapterEditorConsequenceAdoptRequestSchema = chapterEditorConsequenceRequestSchema.extend({ receipt: z.string().uuid() }).strict();
