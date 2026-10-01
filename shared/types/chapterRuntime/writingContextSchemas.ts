import { z } from "zod";
import { storyPlanRoleSchema } from "./primitives.js";
import { dynamicCharacterRiskLevelSchema } from "./dynamicCharacterSchemas.js";
import { generationNextActionSchema, chapterStateGoalSchema, chapterPayoffDirectiveSchema } from "../canonicalState";
import { lengthBudgetContractSchema, chapterScenePlanSchema } from "../chapterLengthControl";
import { readerExperienceContractSchema, EMPTY_READER_EXPERIENCE_CONTRACT } from "../novel/readerExperience";
import { runtimeCharacterSchema } from "./sourceSchemas.js";
import { runtimePayoffLedgerItemSchema, runtimePayoffLedgerSummarySchema } from "./payoffSchemas.js";
import { timelineContextForChapterSchema } from "../timeline";
import { characterResourceContextSchema } from "../characterResource";
import { runtimeStyleContractSchema } from "./styleSchemas.js";
import { auditSeveritySchema } from "./qualitySchemas.js";

export const bookContractContextSchema = z.object({
  title: z.string(),
  genre: z.string(),
  targetAudience: z.string(),
  sellingPoint: z.string(),
  first30ChapterPromise: z.string(),
  narrativePov: z.string(),
  pacePreference: z.string(),
  emotionIntensity: z.string(),
  toneGuardrails: z.array(z.string()).default([]),
  hardConstraints: z.array(z.string()).default([]),
  readingPromise: z.string().default(""),
  protagonistFantasy: z.string().default(""),
  coreSellingPoint: z.string().default(""),
  chapter3Payoff: z.string().default(""),
  chapter10Payoff: z.string().default(""),
  chapter30Payoff: z.string().default(""),
  escalationLadder: z.string().default(""),
  relationshipMainline: z.string().default(""),
  activeMilestonePayoffs: z.array(z.string()).default([]),
  completionMode: z.enum(["compact_book", "serial_book"]).default("serial_book"),
  promiseScope: z.enum(["whole_book", "first_30_chapters"]).default("first_30_chapters"),
  targetChapterCount: z.number().int().positive().nullable().default(null),
  endingRequiredBy: z.number().int().positive().nullable().default(null),
});

export const macroConstraintContextSchema = z.object({
  sellingPoint: z.string(),
  coreConflict: z.string(),
  mainHook: z.string(),
  progressionLoop: z.string(),
  growthPath: z.string(),
  endingFlavor: z.string(),
  hardConstraints: z.array(z.string()).default([]),
});

export const volumeKeyMilestoneGuardSchema = z.object({
  targetChapterRange: z.string(),
  event: z.string(),
  status: z.enum(["not_yet", "in_progress", "done"]).default("not_yet"),
  note: z.string(),
});

export const volumeWindowContextSchema = z.object({
  volumeId: z.string().nullable().optional(),
  sortOrder: z.number().int().nullable().optional(),
  title: z.string(),
  missionSummary: z.string(),
  adjacentSummary: z.string(),
  pendingPayoffs: z.array(z.string()).default([]),
  softFutureSummary: z.string(),
  keyMilestoneGuards: z.array(volumeKeyMilestoneGuardSchema).default([]),
  readerRewardLadder: z.string().default(""),
  coreReward: z.string().default(""),
});

export const chapterMissionContextSchema = z.object({
  chapterId: z.string(),
  chapterOrder: z.number().int(),
  title: z.string(),
  objective: z.string(),
  expectation: z.string(),
  taskSheet: z.string().nullable().optional(),
  targetWordCount: z.number().int().nullable().optional(),
  planRole: storyPlanRoleSchema.nullable().optional(),
  hookTarget: z.string(),
  mustAdvance: z.array(z.string()).default([]),
  mustPreserve: z.array(z.string()).default([]),
  riskNotes: z.array(z.string()).default([]),
});

export const chapterBoundaryContractSchema = z.object({
  exclusiveEvent: z.string().nullable().optional(),
  entryState: z.string().nullable().optional(),
  endingState: z.string().nullable().optional(),
  nextChapterEntryState: z.string().nullable().optional(),
  doNotCross: z.array(z.string()).default([]),
  protectedReveals: z.array(z.string()).default([]),
  allowedRevealLevel: z.number().int().nullable().optional(),
});

export const chapterExecutionObligationContractSchema = z.object({
  mustHitNow: z.array(z.string()).default([]),
  mustPreserve: z.array(z.string()).default([]),
  requiredPayoffTouches: z.array(z.string()).default([]),
  requiredCharacterAppearances: z.array(z.string()).default([]),
  requiredGoalChanges: z.array(z.string()).default([]),
  canDefer: z.array(z.string()).default([]),
  forbiddenCrossings: z.array(z.string()).default([]),
});

export const chapterCharacterBehaviorGuideSchema = z.object({
  characterId: z.string(),
  name: z.string(),
  role: z.string(),
  castRole: z.string().nullable().optional(),
  volumeRoleLabel: z.string().nullable().optional(),
  volumeResponsibility: z.string().nullable().optional(),
  currentGoal: z.string().nullable().optional(),
  currentState: z.string().nullable().optional(),
  visibleProfileSummary: z.string().nullable().optional(),
  factionLabel: z.string().nullable().optional(),
  stanceLabel: z.string().nullable().optional(),
  relationStageLabels: z.array(z.string()).default([]),
  relationRiskNotes: z.array(z.string()).default([]),
  plannedChapterOrders: z.array(z.number().int()).default([]),
  absenceRisk: dynamicCharacterRiskLevelSchema,
  absenceSpan: z.number().int().nonnegative(),
  isCoreInVolume: z.boolean(),
  shouldPreferAppearance: z.boolean(),
  mindGuidance: z.string().nullable().optional(),
  authorInfluenceGuidance: z.string().nullable().optional(),
});

export const chapterRelationStageGuideSchema = z.object({
  relationId: z.string().nullable().optional(),
  sourceCharacterId: z.string(),
  sourceCharacterName: z.string(),
  targetCharacterId: z.string(),
  targetCharacterName: z.string(),
  stageLabel: z.string(),
  stageSummary: z.string(),
  nextTurnPoint: z.string().nullable().optional(),
  isCurrent: z.boolean(),
});

export const chapterCandidateGuardSchema = z.object({
  id: z.string(),
  proposedName: z.string(),
  proposedRole: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  evidence: z.array(z.string()).default([]),
  sourceChapterOrder: z.number().int().nullable().optional(),
});

export const chapterCharacterPendingReviewFieldSchema = z.enum(["currentState", "currentGoal"]);

export const chapterCharacterHardFactSchema = z.object({
  characterId: z.string(),
  name: z.string(),
  role: z.string().nullable().optional(),
  importanceTier: z.enum(["lead", "major", "named", "extra"]).default("named"),
  identityLabel: z.string().nullable().optional(),
  factionLabel: z.string().nullable().optional(),
  stanceLabel: z.string().nullable().optional(),
  powerLevel: z.string().nullable().optional(),
  realm: z.string().nullable().optional(),
  currentLocation: z.string().nullable().optional(),
  availability: z.string().nullable().optional(),
  currentState: z.string().nullable().optional(),
  currentGoal: z.string().nullable().optional(),
  prohibitions: z.array(z.string()).default([]),
  pendingReviewFields: z.array(chapterCharacterPendingReviewFieldSchema).default([]),
});

export const chapterWriteContextSchema = z.object({
  bookContract: bookContractContextSchema,
  productionFoundationPrompt: z.string().default(""),
  macroConstraints: macroConstraintContextSchema.nullable(),
  volumeWindow: volumeWindowContextSchema.nullable(),
  narrativeProgressHint: z.string().nullable().optional(),
  chapterMission: chapterMissionContextSchema,
  nextAction: generationNextActionSchema.default("write_chapter"),
  chapterStateGoal: chapterStateGoalSchema.nullable().optional(),
  protectedSecrets: z.array(z.string()).default([]),
  payoffDirectives: z.array(chapterPayoffDirectiveSchema).default([]),
  obligationContract: chapterExecutionObligationContractSchema.default({
    mustHitNow: [],
    mustPreserve: [],
    requiredPayoffTouches: [],
    requiredCharacterAppearances: [],
    requiredGoalChanges: [],
    canDefer: [],
    forbiddenCrossings: [],
  }),
  chapterBoundary: chapterBoundaryContractSchema.nullable().optional(),
  lengthBudget: lengthBudgetContractSchema.nullable(),
  scenePlan: chapterScenePlanSchema.nullable().optional(),
  readerExperience: readerExperienceContractSchema.default(EMPTY_READER_EXPERIENCE_CONTRACT),
  participants: z.array(runtimeCharacterSchema),
  characterHardFacts: z.array(chapterCharacterHardFactSchema).default([]),
  characterBehaviorGuides: z.array(chapterCharacterBehaviorGuideSchema).default([]),
  activeRelationStages: z.array(chapterRelationStageGuideSchema).default([]),
  pendingCandidateGuards: z.array(chapterCandidateGuardSchema).default([]),
  localStateSummary: z.string(),
  openConflictSummaries: z.array(z.string()).default([]),
  ledgerPendingItems: z.array(runtimePayoffLedgerItemSchema).default([]),
  ledgerUrgentItems: z.array(runtimePayoffLedgerItemSchema).default([]),
  ledgerOverdueItems: z.array(runtimePayoffLedgerItemSchema).default([]),
  ledgerSummary: runtimePayoffLedgerSummarySchema.nullable().optional(),
  timelineContext: timelineContextForChapterSchema.nullable().optional(),
  characterResourceContext: characterResourceContextSchema.nullable().optional(),
  recentChapterSummaries: z.array(z.string()).default([]),
  previousChapterTail: z.string().nullable().optional(),
  openingAntiRepeatHint: z.string(),
  styleContract: runtimeStyleContractSchema.nullable().optional(),
  styleConstraints: z.array(z.string()).default([]),
  continuationConstraints: z.array(z.string()).default([]),
  ragFacts: z.array(z.string()).default([]),
  completedMilestones: z.array(z.string()).default([]),
  recentScenePatterns: z.array(z.string()).default([]),
});

export const chapterReviewContextSchema = chapterWriteContextSchema.extend({
  structureObligations: z.array(z.string()).default([]),
  worldRules: z.array(z.string()).default([]),
  historicalIssues: z.array(z.string()).default([]),
});

export const chapterRepairIssueSchema = z.object({
  severity: auditSeveritySchema,
  category: z.string(),
  evidence: z.string(),
  fixSuggestion: z.string(),
});

export const chapterRepairContextSchema = z.object({
  writeContext: chapterWriteContextSchema,
  issues: z.array(chapterRepairIssueSchema).default([]),
  structureObligations: z.array(z.string()).default([]),
  worldRules: z.array(z.string()).default([]),
  historicalIssues: z.array(z.string()).default([]),
  allowedEditBoundaries: z.array(z.string()).default([]),
});

export type ChapterCharacterHardFact = z.infer<typeof chapterCharacterHardFactSchema>;

export type ChapterCharacterPendingReviewField = z.infer<typeof chapterCharacterPendingReviewFieldSchema>;

export type BookContractContext = z.infer<typeof bookContractContextSchema>;

export type MacroConstraintContext = z.infer<typeof macroConstraintContextSchema>;

export type VolumeWindowContext = z.infer<typeof volumeWindowContextSchema>;

export type ChapterMissionContext = z.infer<typeof chapterMissionContextSchema>;

export type ChapterBoundaryContract = z.infer<typeof chapterBoundaryContractSchema>;

export type ChapterExecutionObligationContract = z.infer<typeof chapterExecutionObligationContractSchema>;

export type ChapterCharacterBehaviorGuide = z.infer<typeof chapterCharacterBehaviorGuideSchema>;

export type ChapterRelationStageGuide = z.infer<typeof chapterRelationStageGuideSchema>;

export type ChapterCandidateGuard = z.infer<typeof chapterCandidateGuardSchema>;

export type ChapterWriteContext = z.infer<typeof chapterWriteContextSchema>;

export type ChapterReviewContext = z.infer<typeof chapterReviewContextSchema>;

export type ChapterRepairIssue = z.infer<typeof chapterRepairIssueSchema>;

export type ChapterRepairContext = z.infer<typeof chapterRepairContextSchema>;
