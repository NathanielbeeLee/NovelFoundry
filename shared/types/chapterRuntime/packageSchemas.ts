import { z } from "zod";
import { runtimeChapterSchema, runtimePlanSchema, runtimeCharacterSchema, runtimeCreativeDecisionSchema, runtimeContinuationSchema, runtimeCharacterMindStateSchema, runtimeCharacterDialogueGuidanceSchema } from "./sourceSchemas.js";
import { canonicalStateSnapshotSchema, generationNextActionSchema, chapterStateGoalSchema } from "../canonicalState";
import { runtimeStateSnapshotSchema, runtimeOpenConflictSchema } from "./stateSchemas.js";
import { storyWorldSliceSchema } from "../storyWorldSlice";
import { chapterCharacterHardFactSchema, bookContractContextSchema, macroConstraintContextSchema, volumeWindowContextSchema, chapterMissionContextSchema, chapterWriteContextSchema, chapterReviewContextSchema, chapterRepairContextSchema, chapterExecutionObligationContractSchema } from "./writingContextSchemas.js";
import { runtimeAuditIssueSchema, runtimeQualityScoreSchema, runtimeAuditReportSchema, runtimeLengthControlSchema, runtimeStyleReviewSchema, chapterAcceptanceStatusSchema, chapterAcceptanceContinuePolicySchema, chapterAcceptanceRepairDirectiveSchema, chapterAcceptanceAssetSyncRecommendationSchema } from "./qualitySchemas.js";
import { runtimeStyleContextSchema } from "./styleSchemas.js";
import { runtimeDynamicCharacterOverviewSchema } from "./dynamicCharacterSchemas.js";
import { runtimePayoffLedgerItemSchema, runtimePayoffLedgerSummarySchema } from "./payoffSchemas.js";
import { timelineContextForChapterSchema, timelineCheckResultSchema } from "../timeline";
import { characterResourceContextSchema } from "../characterResource";
import { contextGatingDecisionSchema, chapterChangeFlagsSchema, tokenBudgetPolicySchema, promptBudgetProfileSchema } from "./contextPolicySchemas.js";
import { chapterGenerationStateSchema } from "./primitives.js";
import { chapterExecutionObligationCoverageSchema, chapterFailureClassificationSchema } from "./obligationSchemas.js";

export const generationContextPackageSchema = z.object({
  chapter: runtimeChapterSchema,
  plan: runtimePlanSchema.nullable(),
  canonicalState: canonicalStateSnapshotSchema.nullable().optional(),
  nextAction: generationNextActionSchema.default("write_chapter"),
  chapterStateGoal: chapterStateGoalSchema.nullable().optional(),
  protectedSecrets: z.array(z.string()).default([]),
  pendingReviewProposalCount: z.number().int().nonnegative().default(0),
  stateSnapshot: runtimeStateSnapshotSchema.nullable(),
  openConflicts: z.array(runtimeOpenConflictSchema),
  storyWorldSlice: storyWorldSliceSchema.nullable().optional(),
  characterRoster: z.array(runtimeCharacterSchema),
  characterHardFacts: z.array(chapterCharacterHardFactSchema).default([]),
  creativeDecisions: z.array(runtimeCreativeDecisionSchema),
  openAuditIssues: z.array(runtimeAuditIssueSchema),
  previousChaptersSummary: z.array(z.string()),
  previousChapterTail: z.string().nullable().optional(),
  openingHint: z.string(),
  continuation: runtimeContinuationSchema,
  styleContext: runtimeStyleContextSchema.nullable().optional(),
  characterDynamics: runtimeDynamicCharacterOverviewSchema.nullable().optional(),
  characterMindStates: z.array(runtimeCharacterMindStateSchema).default([]),
  // Optional for older preview / recovery context producers; runtime consumers default to no guidance.
  characterDialogueGuidances: z.array(runtimeCharacterDialogueGuidanceSchema).optional(),
  bookContract: bookContractContextSchema.nullable().optional(),
  macroConstraints: macroConstraintContextSchema.nullable().optional(),
  volumeWindow: volumeWindowContextSchema.nullable().optional(),
  narrativeProgressHint: z.string().nullable().optional(),
  ledgerPendingItems: z.array(runtimePayoffLedgerItemSchema).default([]),
  ledgerUrgentItems: z.array(runtimePayoffLedgerItemSchema).default([]),
  ledgerOverdueItems: z.array(runtimePayoffLedgerItemSchema).default([]),
  ledgerSummary: runtimePayoffLedgerSummarySchema.nullable().optional(),
  timelineContext: timelineContextForChapterSchema.nullable().optional(),
  characterResourceContext: characterResourceContextSchema.nullable().optional(),
  ragContext: z.string().default(""),
  chapterMission: chapterMissionContextSchema.nullable().optional(),
  chapterWriteContext: chapterWriteContextSchema.nullable().optional(),
  chapterReviewContext: chapterReviewContextSchema.nullable().optional(),
  chapterRepairContext: chapterRepairContextSchema.nullable().optional(),
  contextGatingDecisions: z.array(contextGatingDecisionSchema).default([]),
  chapterChangeFlags: chapterChangeFlagsSchema.optional(),
  tokenBudgetPolicy: tokenBudgetPolicySchema.optional(),
  promptBudgetProfiles: z.array(promptBudgetProfileSchema).default([]),
});

export const chapterRuntimePackageSchema = z.object({
  novelId: z.string(),
  chapterId: z.string(),
  context: generationContextPackageSchema,
  draft: z.object({
    content: z.string(),
    wordCount: z.number().int().nonnegative(),
    generationState: chapterGenerationStateSchema.optional(),
  }),
  audit: z.object({
    score: runtimeQualityScoreSchema,
    reports: z.array(runtimeAuditReportSchema),
    openIssues: z.array(runtimeAuditIssueSchema),
    hasBlockingIssues: z.boolean(),
  }),
  obligationContract: chapterExecutionObligationContractSchema.default({
    mustHitNow: [],
    mustPreserve: [],
    requiredPayoffTouches: [],
    requiredCharacterAppearances: [],
    requiredGoalChanges: [],
    canDefer: [],
    forbiddenCrossings: [],
  }),
  obligationCoverage: chapterExecutionObligationCoverageSchema.default({
    status: "satisfied",
    missing: [],
    summary: "旧运行记录未包含章节义务覆盖信息。",
  }),
  failureClassification: chapterFailureClassificationSchema.default({
    code: "none",
    summary: "旧运行记录未包含失败分类。",
    decisionReason: null,
    blockingObligations: [],
  }),
  replanRecommendation: z.object({
    recommended: z.boolean(),
    action: z.enum(["continue_with_warning", "local_patch_plan", "stop_for_replan"]).optional(),
    scope: z.enum(["local_window", "global_book"]).optional(),
    reason: z.string(),
    blockingIssueIds: z.array(z.string()),
    blockingLedgerKeys: z.array(z.string()).default([]),
    affectedChapterOrders: z.array(z.number().int()).default([]),
    anchorChapterOrder: z.number().int().nullable().optional(),
    triggerReason: z.string().optional(),
    windowReason: z.string().optional(),
    whyTheseChapters: z.string().optional(),
  }),
  lengthControl: runtimeLengthControlSchema.optional(),
  styleReview: runtimeStyleReviewSchema.optional(),
  timelineCheck: timelineCheckResultSchema.optional(),
  meta: z.object({
    provider: z.string().optional(),
    model: z.string().optional(),
    temperature: z.number().optional(),
    runId: z.string().optional(),
    generatedAt: z.string().optional(),
    nextAction: generationNextActionSchema.optional(),
    stateGoalSummary: z.string().optional(),
    pendingReviewProposalCount: z.number().int().nonnegative().optional(),
    acceptanceStatus: chapterAcceptanceStatusSchema.optional(),
    continuePolicy: chapterAcceptanceContinuePolicySchema.optional(),
    riskTags: z.array(z.string()).optional(),
    repairDirectives: z.array(chapterAcceptanceRepairDirectiveSchema).optional(),
    assetSyncRecommendation: chapterAcceptanceAssetSyncRecommendationSchema.optional(),
  }),
});

export type RuntimeCharacterResourceContext = z.infer<typeof characterResourceContextSchema>;

export type GenerationContextPackage = z.infer<typeof generationContextPackageSchema>;

export type ChapterRuntimePackage = z.infer<typeof chapterRuntimePackageSchema>;
