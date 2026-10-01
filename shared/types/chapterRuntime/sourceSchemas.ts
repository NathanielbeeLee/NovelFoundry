import { z } from "zod";
import { storyPlanRoleSchema } from "./primitives.js";

export const runtimeChapterSchema = z.object({
  id: z.string(),
  title: z.string(),
  order: z.number().int(),
  content: z.string().nullable().optional(),
  expectation: z.string().nullable().optional(),
  targetWordCount: z.number().int().nullable().optional(),
  conflictLevel: z.number().int().nullable().optional(),
  revealLevel: z.number().int().nullable().optional(),
  mustAvoid: z.string().nullable().optional(),
  taskSheet: z.string().nullable().optional(),
  sceneCards: z.string().nullable().optional(),
  hook: z.string().nullable().optional(),
  supportingContextText: z.string().default(""),
});

export const runtimePlanSceneSchema = z.object({
  id: z.string(),
  sortOrder: z.number().int(),
  title: z.string(),
  objective: z.string().nullable().optional(),
  conflict: z.string().nullable().optional(),
  reveal: z.string().nullable().optional(),
  emotionBeat: z.string().nullable().optional(),
});

export const runtimePlanSchema = z.object({
  id: z.string(),
  chapterId: z.string().nullable().optional(),
  planRole: storyPlanRoleSchema.nullable().optional(),
  phaseLabel: z.string().nullable().optional(),
  title: z.string(),
  objective: z.string(),
  participants: z.array(z.string()),
  reveals: z.array(z.string()),
  riskNotes: z.array(z.string()),
  mustAdvance: z.array(z.string()).default([]),
  mustPreserve: z.array(z.string()).default([]),
  sourceIssueIds: z.array(z.string()).default([]),
  replannedFromPlanId: z.string().nullable().optional(),
  hookTarget: z.string().nullable().optional(),
  rawPlanJson: z.string().nullable().optional(),
  scenes: z.array(runtimePlanSceneSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const runtimeCharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  importanceTier: z.enum(["lead", "major", "named", "extra"]).default("named"),
  personality: z.string().nullable().optional(),
  background: z.string().nullable().optional(),
  development: z.string().nullable().optional(),
  identityLabel: z.string().nullable().optional(),
  factionLabel: z.string().nullable().optional(),
  stanceLabel: z.string().nullable().optional(),
  powerLevel: z.string().nullable().optional(),
  realm: z.string().nullable().optional(),
  currentLocation: z.string().nullable().optional(),
  availability: z.string().nullable().optional(),
  prohibitions: z.array(z.string()).default([]),
  currentState: z.string().nullable().optional(),
  currentGoal: z.string().nullable().optional(),
  appearance: z.string().nullable().optional(),
  physique: z.string().nullable().optional(),
  attireStyle: z.string().nullable().optional(),
  signatureDetail: z.string().nullable().optional(),
  voiceTexture: z.string().nullable().optional(),
  presenceImpression: z.string().nullable().optional(),
});

export const runtimeCharacterMindStateSchema = z.object({
  characterId: z.string(),
  currentInterpretation: z.string(),
  privateIntent: z.string().nullable().optional(),
  activePlan: z.string().nullable().optional(),
  emotionalStance: z.string().nullable().optional(),
  actionTendency: z.string().nullable().optional(),
  decisionTrigger: z.string().nullable().optional(),
  beliefs: z.array(z.string()).default([]),
  misbeliefs: z.array(z.string()).default([]),
  evidence: z.array(z.string()).default([]),
  confidence: z.number().nullable().optional(),
  sourceChapterId: z.string().nullable().optional(),
});

export const runtimeCharacterDialogueGuidanceSchema = z.object({
  influenceId: z.string(),
  characterId: z.string(),
  summary: z.string(),
  behaviorGuidance: z.string(),
  emotionalGuidance: z.string().nullable().optional(),
  relationTension: z.string().nullable().optional(),
  targetStartChapterOrder: z.number().int(),
  targetEndChapterOrder: z.number().int(),
});

export const runtimeCreativeDecisionSchema = z.object({
  id: z.string(),
  chapterId: z.string().nullable().optional(),
  category: z.string(),
  content: z.string(),
  importance: z.string(),
  expiresAt: z.number().int().nullable().optional(),
  sourceType: z.string().nullable().optional(),
  sourceRefId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const runtimeContinuationSchema = z.object({
  enabled: z.boolean(),
  sourceType: z.enum(["novel", "knowledge_document"]).nullable(),
  sourceId: z.string().nullable(),
  sourceTitle: z.string(),
  systemRule: z.string(),
  humanBlock: z.string(),
  antiCopyCorpus: z.array(z.string()).default([]),
});

export type RuntimeChapter = z.infer<typeof runtimeChapterSchema>;

export type RuntimePlanScene = z.infer<typeof runtimePlanSceneSchema>;

export type RuntimePlan = z.infer<typeof runtimePlanSchema>;

export type RuntimeCharacter = z.infer<typeof runtimeCharacterSchema>;

export type RuntimeCreativeDecision = z.infer<typeof runtimeCreativeDecisionSchema>;

export type RuntimeContinuation = z.infer<typeof runtimeContinuationSchema>;
