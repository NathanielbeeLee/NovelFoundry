import { runtimeQualityScoreSchema, qualityScoreAvailabilitySchema } from "@novelfoundry/shared/types/chapterRuntime/qualitySchemas";
import { z } from "zod";
import { chapterAcceptanceAssessmentSchema } from "../../../../../prompting/prompts/novel/chapterAcceptance.prompts";

// The model must still return a complete numeric assessment. Only the host may
// represent an unavailable assessment, without inventing narrative grades.
export const normalizedAcceptanceAssessmentSchema = chapterAcceptanceAssessmentSchema.extend({
  score: runtimeQualityScoreSchema.nullable(),
  scoreAvailability: qualityScoreAvailabilitySchema,
  scoreReason: z.string().nullable(),
});

export type ChapterAcceptanceAssessment = z.infer<typeof normalizedAcceptanceAssessmentSchema>;
