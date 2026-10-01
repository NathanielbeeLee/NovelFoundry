import type { DirectorProjectContextInput, DirectorTakeoverEntryStep, DirectorTakeoverExecutableRangeSnapshot, DirectorTakeoverPipelineJobSnapshot, DirectorTakeoverStartPhase, DirectorTakeoverStrategy, DirectorTakeoverCheckpointSnapshot } from "@novelfoundry/shared/types/novelDirector";
import type { NovelWorkflowStage } from "@novelfoundry/shared/types/novelWorkflow";

export interface DirectorTakeoverNovelContext extends Omit<DirectorProjectContextInput, "description"> {
  id: string;
  title: string;
  description?: string | null;
  commercialTags: string[];
}

export interface DirectorTakeoverAssetSnapshot {
  hasStoryMacroPlan: boolean;
  hasBookContract: boolean;
  hasWorldSetupPrepared: boolean;
  characterCount: number;
  chapterCount: number;
  plannedChapterCount?: number | null;
  volumeCount: number;
  hasVolumeStrategyPlan?: boolean;
  firstVolumeId: string | null;
  firstVolumeChapterCount: number;
  volumeChapterRanges?: Array<{
    volumeOrder: number;
    startOrder: number;
    endOrder: number;
  }>;
  structuredOutlineChapterOrders?: number[];
  firstVolumeBeatSheetReady?: boolean;
  firstVolumePreparedChapterCount?: number;
  structuredOutlineRecoveryStep?: "beat_sheet" | "chapter_list" | "chapter_detail_bundle" | "chapter_sync" | "completed" | null;
  generatedChapterCount?: number;
  approvedChapterCount?: number;
  pendingRepairChapterCount?: number;
  /**
   * 目标自动执行范围内是否仍有「未处理且缺少完整章节细化」的章节。
   * 为真时，继续模式应先回到节奏 / 拆章补齐细化，而非直接进入章节执行
   * （否则 runFromReady 会抛「缺少完整章节细化」并卡死）。
   */
  hasUnpreparedChaptersInRange?: boolean;
  /** 缺少完整细化的章节序（调试/展示用）。 */
  missingExecutionContractOrders?: number[];
}

export interface DirectorTakeoverDecisionInput {
  entryStep: DirectorTakeoverEntryStep;
  strategy: DirectorTakeoverStrategy;
  snapshot: DirectorTakeoverAssetSnapshot;
  activePipelineJob?: DirectorTakeoverPipelineJobSnapshot | null;
  latestCheckpoint?: DirectorTakeoverCheckpointSnapshot | null;
  executableRange?: DirectorTakeoverExecutableRangeSnapshot | null;
}

export interface DirectorTakeoverResolvedPlan {
  entryStep: DirectorTakeoverEntryStep;
  strategy: DirectorTakeoverStrategy;
  effectiveStep: DirectorTakeoverEntryStep;
  effectiveStage: NovelWorkflowStage;
  startPhase: DirectorTakeoverStartPhase;
  resumeStage: "basic" | "story_macro" | "world" | "character" | "outline" | "structured" | "chapter" | "pipeline";
  skipSteps: DirectorTakeoverEntryStep[];
  summary: string;
  effectSummary: string;
  impactNotes: string[];
  usesCurrentBatch: boolean;
  currentStep?: DirectorTakeoverEntryStep | null;
  restartStep?: DirectorTakeoverEntryStep | null;
  executionMode: "phase" | "auto_execution";
  phase?: DirectorTakeoverStartPhase;
  resumeCheckpointType?: "chapter_batch_ready" | "step_review_required" | "replan_required" | null;
}
