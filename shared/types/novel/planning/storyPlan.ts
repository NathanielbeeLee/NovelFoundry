export type StoryPlanLevel = "book" | "arc" | "chapter";

export type StoryPlanRole = "setup" | "progress" | "pressure" | "turn" | "payoff" | "cooldown";

export interface ChapterPlanScene {
  id: string;
  planId: string;
  sortOrder: number;
  title: string;
  objective?: string | null;
  conflict?: string | null;
  reveal?: string | null;
  emotionBeat?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoryPlan {
  id: string;
  novelId: string;
  chapterId?: string | null;
  parentId?: string | null;
  sourceStateSnapshotId?: string | null;
  level: StoryPlanLevel;
  planRole?: StoryPlanRole | null;
  phaseLabel?: string | null;
  title: string;
  objective: string;
  participantsJson?: string | null;
  revealsJson?: string | null;
  riskNotesJson?: string | null;
  mustAdvanceJson?: string | null;
  mustPreserveJson?: string | null;
  sourceIssueIdsJson?: string | null;
  replannedFromPlanId?: string | null;
  hookTarget?: string | null;
  status: string;
  externalRef?: string | null;
  rawPlanJson?: string | null;
  scenes: ChapterPlanScene[];
  createdAt: string;
  updatedAt: string;
}

export interface ReplanResult {
  primaryPlan: StoryPlan;
  generatedPlans: StoryPlan[];
  affectedChapterIds: string[];
  affectedChapterOrders: number[];
  anchorChapterOrder?: number | null;
  sourceIssueIds: string[];
  triggerType: string;
  reason: string;
  triggerReason?: string;
  windowReason?: string;
  whyTheseChapters?: string;
  windowSize: number;
  blockingLedgerKeys?: string[];
  run: {
    id: string;
    outputSummary?: string | null;
    createdAt: string;
  } | null;
}
