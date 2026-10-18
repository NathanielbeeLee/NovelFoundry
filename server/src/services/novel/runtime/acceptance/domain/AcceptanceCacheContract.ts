import { z } from "zod";
import { runtimeAuditReportSchema, runtimeQualityScoreSchema, qualityScoreAvailabilitySchema, resolveQualityScoreState } from "@novelfoundry/shared/types/chapterRuntime/qualitySchemas";
import { normalizedAcceptanceAssessmentSchema } from "./AcceptanceAssessmentContract";
import type { ChapterAcceptanceAssessmentResult } from "../../ChapterAcceptanceAssessmentService";

const cachedResultSchema = z.object({
  assessment: normalizedAcceptanceAssessmentSchema,
  score: runtimeQualityScoreSchema.nullable(),
  scoreAvailability: qualityScoreAvailabilitySchema,
  scoreReason: z.string().nullable(),
  issues: z.array(z.object({
    severity: z.enum(["low", "medium", "high", "critical"]),
    category: z.enum(["coherence", "repetition", "pacing", "voice", "engagement", "logic"]),
    evidence: z.string(), fixSuggestion: z.string(),
  })),
  auditReports: z.array(runtimeAuditReportSchema),
});

export function parseCachedAcceptanceResult(value: unknown): ChapterAcceptanceAssessmentResult | null {
  const parsed = cachedResultSchema.safeParse(value);
  if (!parsed.success) return null;
  const state = resolveQualityScoreState({ ...parsed.data, reports: parsed.data.auditReports, riskTags: parsed.data.assessment.riskTags });
  return state.score ? { ...parsed.data, ...state } : null;
}
