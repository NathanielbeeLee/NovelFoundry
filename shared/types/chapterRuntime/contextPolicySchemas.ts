import { z } from "zod";
import { contextBlockTierSchema, auditModeSchema } from "./primitives.js";

export const promptBudgetProfileSchema = z.object({
  promptId: z.string(),
  maxTokensBudget: z.number().int().positive(),
  preferredGroups: z.array(z.string()).default([]),
  dropOrder: z.array(z.string()).default([]),
});

export const contextGatingDecisionSchema = z.object({
  blockId: z.string(),
  tier: contextBlockTierSchema,
  included: z.boolean(),
  reason: z.string().optional(),
});

export const chapterChangeFlagsSchema = z.object({
  introducedPayoff: z.boolean().default(false),
  payoffResolutionSignal: z.boolean().default(false),
  relationshipShiftSignal: z.boolean().default(false),
  majorStateShiftSignal: z.boolean().default(false),
});

export const tokenBudgetPolicySchema = z.object({
  chapterBudgetProfile: z.string().default("balanced"),
  stageTokenCap: z.record(z.string(), z.number().int().positive()).default({}),
  retryCap: z.record(z.string(), z.number().int().nonnegative()).default({}),
  auditMode: auditModeSchema.default("light"),
});

export type PromptBudgetProfile = z.infer<typeof promptBudgetProfileSchema>;

export type ContextGatingDecision = z.infer<typeof contextGatingDecisionSchema>;

export type ChapterChangeFlags = z.infer<typeof chapterChangeFlagsSchema>;

export type TokenBudgetPolicy = z.infer<typeof tokenBudgetPolicySchema>;
