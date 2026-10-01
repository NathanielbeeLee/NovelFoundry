import { z } from "zod";
import type { LLMProvider } from "../llm";

const llmProviderSchema = z.custom<LLMProvider>((value) => typeof value === "string" && value.trim().length > 0);

export const chapterGenerationStateSchema = z.enum(["planned", "drafted", "reviewed", "repaired", "approved", "published"]);

export const storyPlanRoleSchema = z.enum(["setup", "progress", "pressure", "turn", "payoff", "cooldown"]);

export const auditModeSchema = z.enum(["light", "full", "repair_only"]);

export const contextBlockTierSchema = z.enum(["hard_required", "situational", "optional"]);

export const chapterRuntimeRequestSchema = z.object({
  targetEndChapter: z.number().int().positive().optional(),
  provider: llmProviderSchema.optional(),
  model: z.string().trim().optional(),
  temperature: z.number().min(0).max(2).optional(),
  previousChaptersSummary: z.array(z.string()).optional(),
  taskStyleProfileId: z.string().trim().optional(),
});

export type ChapterRuntimeRequest = z.infer<typeof chapterRuntimeRequestSchema>;

export type AuditMode = z.infer<typeof auditModeSchema>;

export type ContextBlockTier = z.infer<typeof contextBlockTierSchema>;
