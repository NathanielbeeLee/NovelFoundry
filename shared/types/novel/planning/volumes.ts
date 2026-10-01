export type VolumePlanVersionStatus = "draft" | "active" | "frozen";

export type VolumeGenerationScope =
  | "strategy"
  | "strategy_critique"
  | "skeleton"
  | "beat_sheet"
  | "chapter_list"
  | "chapter_detail"
  | "rebalance";

export type VolumeGenerationScopeInput = VolumeGenerationScope | "book" | "volume";

export type VolumeChapterListGenerationMode = "full_volume" | "single_beat";

export interface StructuredOutlineVolume {
  volumeTitle: string;
  chapters: Array<{
    order: number;
    title: string;
    summary: string;
  }>;
}

export interface VolumeChapterPlan {
  id: string;
  volumeId: string;
  chapterId?: string | null;
  chapterOrder: number;
  beatKey?: string | null;
  title: string;
  summary: string;
  purpose?: string | null;
  exclusiveEvent?: string | null;
  endingState?: string | null;
  nextChapterEntryState?: string | null;
  conflictLevel?: number | null;
  conflictLevelSource?: "ai" | "user" | null;
  revealLevel?: number | null;
  targetWordCount?: number | null;
  mustAvoid?: string | null;
  taskSheet?: string | null;
  sceneCards?: string | null;
  styleContract?: string | null;
  payoffRefs: string[];
  createdAt: string;
  updatedAt: string;
}

export type VolumeStrategyPlanningMode = "hard" | "soft";

export type VolumeUncertaintyLevel = "low" | "medium" | "high";

export type VolumeBeatSheetStatus = "not_started" | "generated" | "revised";

export type VolumeCritiqueRiskLevel = "low" | "medium" | "high";

export type VolumeRebalanceSeverity = "low" | "medium" | "high";

export type VolumeRebalanceDirection =
  | "pull_forward"
  | "push_back"
  | "tighten_current"
  | "expand_adjacent"
  | "hold";

export type VolumeUncertaintyTargetType = "book" | "volume" | "beat_sheet" | "chapter_list";

export interface VolumeCountRange {
  min: number;
  max: number;
}

export interface VolumeChapterTargetRange {
  min: number;
  ideal: number;
  max: number;
}

export type VolumeScaleProfile = "short" | "compact" | "standard" | "long" | "epic" | "mega";

export interface VolumeCountGuidance {
  chapterBudget: number;
  targetChapterRange: VolumeChapterTargetRange;
  allowedVolumeCountRange: VolumeCountRange;
  decisionVolumeCountRange: VolumeCountRange;
  volumeScaleProfile: VolumeScaleProfile;
  volumeCountRationale: string;
  recommendedVolumeCount: number;
  systemRecommendedVolumeCount: number;
  hardPlannedVolumeRange: VolumeCountRange;
  userPreferredVolumeCount?: number | null;
  respectedExistingVolumeCount?: number | null;
}

export interface VolumeStrategyVolume {
  sortOrder: number;
  planningMode: VolumeStrategyPlanningMode;
  roleLabel: string;
  coreReward: string;
  escalationFocus: string;
  uncertaintyLevel: VolumeUncertaintyLevel;
}

export interface VolumeUncertaintyMarker {
  targetType: VolumeUncertaintyTargetType;
  targetRef: string;
  level: VolumeUncertaintyLevel;
  reason: string;
}

export interface VolumeStrategyPlan {
  recommendedVolumeCount: number;
  hardPlannedVolumeCount: number;
  readerRewardLadder: string;
  escalationLadder: string;
  midpointShift: string;
  notes: string;
  volumes: VolumeStrategyVolume[];
  uncertainties: VolumeUncertaintyMarker[];
}

export interface VolumeBeat {
  key: string;
  /** 稳定职能名，例如「开卷抓手」。 */
  label: string;
  /** 本卷定制短标题，例如「夜市夺印」。 */
  title?: string | null;
  summary: string;
  chapterSpanHint: string;
  mustDeliver: string[];
}

export interface VolumeBeatSheet {
  volumeId: string;
  volumeSortOrder: number;
  status: VolumeBeatSheetStatus;
  beats: VolumeBeat[];
}

export interface VolumeCritiqueIssue {
  targetRef: string;
  severity: VolumeCritiqueRiskLevel;
  title: string;
  detail: string;
}

export interface VolumeCritiqueReport {
  overallRisk: VolumeCritiqueRiskLevel;
  summary: string;
  issues: VolumeCritiqueIssue[];
  recommendedActions: string[];
}

export interface VolumePlanningReadiness {
  canGenerateStrategy: boolean;
  canGenerateSkeleton: boolean;
  canGenerateBeatSheet: boolean;
  canGenerateChapterList: boolean;
  blockingReasons: string[];
}

export interface VolumeRebalanceDecision {
  anchorVolumeId: string;
  affectedVolumeId: string;
  direction: VolumeRebalanceDirection;
  severity: VolumeRebalanceSeverity;
  summary: string;
  actions: string[];
}

export interface VolumePlan {
  id: string;
  novelId: string;
  sortOrder: number;
  title: string;
  summary?: string | null;
  openingHook?: string | null;
  mainPromise?: string | null;
  primaryPressureSource?: string | null;
  coreSellingPoint?: string | null;
  escalationMode?: string | null;
  protagonistChange?: string | null;
  midVolumeRisk?: string | null;
  climax?: string | null;
  payoffType?: string | null;
  nextVolumeHook?: string | null;
  resetPoint?: string | null;
  openPayoffs: string[];
  status: string;
  sourceVersionId?: string | null;
  chapters: VolumeChapterPlan[];
  createdAt: string;
  updatedAt: string;
}

export interface VolumePlanVersionSummary {
  id: string;
  novelId: string;
  version: number;
  status: VolumePlanVersionStatus;
  diffSummary?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VolumePlanVersion extends VolumePlanVersionSummary {
  contentJson: string;
}

export interface VolumePlanDocument {
  novelId: string;
  workspaceVersion: "v2";
  volumes: VolumePlan[];
  strategyPlan: VolumeStrategyPlan | null;
  critiqueReport: VolumeCritiqueReport | null;
  beatSheets: VolumeBeatSheet[];
  rebalanceDecisions: VolumeRebalanceDecision[];
  readiness: VolumePlanningReadiness;
  derivedOutline: string;
  derivedStructuredOutline: string;
  source: "volume" | "legacy" | "empty";
  activeVersionId: string | null;
}

export interface VolumePlanDiffVolume {
  sortOrder: number;
  title: string;
  changedFields: string[];
  chapterOrders: number[];
}

export interface VolumePlanDiff {
  id: string;
  novelId: string;
  version: number;
  status: VolumePlanVersionStatus;
  diffSummary?: string | null;
  changedLines: number;
  changedVolumeCount: number;
  changedChapterCount: number;
  changedVolumes: VolumePlanDiffVolume[];
  affectedChapterOrders: number[];
}

export type VolumeBeatImpactStatus =
  | "pending"
  | "stale"
  | "locked_with_draft";

export interface VolumeBeatImpactItem {
  volumeId: string;
  volumeOrder: number;
  volumeTitle: string;
  beatKey: string;
  beatLabel: string;
  beatTitle?: string | null;
  chapterOrders: number[];
  status: VolumeBeatImpactStatus;
  reason: "ungenerated" | "generated_without_draft" | "locked_with_draft";
  hasDraftContent: boolean;
}

export interface VolumeImpactResult {
  novelId: string;
  sourceVersion: number | null;
  changedLines: number;
  affectedVolumeCount: number;
  affectedChapterCount: number;
  affectedVolumes: VolumePlanDiffVolume[];
  affectedBeats?: VolumeBeatImpactItem[];
  staleBeatCount?: number;
  lockedBeatCount?: number;
  defaultImpactAction?: string;
  advancedImpactActions?: string[];
  requiresChapterSync: boolean;
  requiresCharacterReview: boolean;
  recommendedActions: string[];
}

export interface VolumeSyncPreviewItem {
  action: "create" | "update" | "keep" | "delete" | "delete_candidate" | "move";
  volumeTitle: string;
  chapterOrder: number;
  nextTitle: string;
  previousTitle?: string | null;
  hasContent: boolean;
  changedFields: string[];
}

export interface VolumeSyncPreview {
  createCount: number;
  updateCount: number;
  keepCount: number;
  moveCount: number;
  deleteCount: number;
  deleteCandidateCount: number;
  affectedGeneratedCount: number;
  clearContentCount: number;
  affectedVolumeCount: number;
  items: VolumeSyncPreviewItem[];
}
