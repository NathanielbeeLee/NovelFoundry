import { z } from "zod";
import { runtimeAuditReportSchema, runtimeQualityScoreSchema } from "@novelfoundry/shared/types/chapterRuntime/qualitySchemas";
import { chapterAcceptanceAssessmentSchema } from "../../../../../prompting/prompts/novel/chapterAcceptance.prompts";
import type { ChapterAcceptanceAssessmentResult } from "../../ChapterAcceptanceAssessmentService";

const cachedResultSchema = z.object({
  assessment: chapterAcceptanceAssessmentSchema,
  score: runtimeQualityScoreSchema,
  issues: z.array(z.object({
    severity: z.enum(["low", "medium", "high", "critical"]),
    category: z.enum(["coherence", "repetition", "pacing", "voice", "engagement", "logic"]),
    evidence: z.string(), fixSuggestion: z.string(),
  })),
  auditReports: z.array(runtimeAuditReportSchema),
});

export function parseCachedAcceptanceResult(value: unknown): ChapterAcceptanceAssessmentResult | null {
  const parsed = cachedResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
