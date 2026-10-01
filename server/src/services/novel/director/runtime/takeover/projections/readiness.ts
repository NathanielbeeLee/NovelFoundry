import type { DirectorTakeoverEntryReadiness, DirectorTakeoverEntryStep, DirectorTakeoverExecutableRangeSnapshot, DirectorTakeoverPipelineJobSnapshot, DirectorTakeoverPreview, DirectorTakeoverReadinessResponse, DirectorTakeoverStageReadiness, DirectorTakeoverStartPhase, DirectorTakeoverStrategy, DirectorTakeoverCheckpointSnapshot } from "@novelfoundry/shared/types/novelDirector";
import { DIRECTOR_TAKEOVER_ENTRY_STEPS } from "@novelfoundry/shared/types/novelDirector";
import { hasMeaningfulSeedMaterial, isStoryMacroReady, isCharacterReady, isOutlineReady, hasExecutableRange, isStructuredSyncPending, isStructuredReady, hasAnyStructuredAsset, hasPendingRepairContext } from "../domain/assetReadiness";
import type { DirectorTakeoverNovelContext, DirectorTakeoverAssetSnapshot } from "../domain/contracts";
import { resolveDirectorTakeoverPlan } from "../domain/executionPlan";
import { entryStepToWorkflowStage, phaseToEntryStep } from "../domain/stageMapping";

const DIRECTOR_TAKEOVER_STAGE_META: Record<
  DirectorTakeoverStartPhase,
  Pick<DirectorTakeoverStageReadiness, "label" | "description">
> = {
  story_macro: {
    label: "从故事宏观规划开始",
    description: "先补齐 Story Macro 和 Book Contract，再继续角色、卷战略和拆章。",
  },
  world_setup: {
    label: "从世界观准备开始",
    description: "沿用故事宏观规划，先完成本书世界观，再继续角色和后续规划。",
  },
  character_setup: {
    label: "从角色准备开始",
    description: "沿用已有书级方向，只让 AI 接手角色阵容和后续规划。",
  },
  volume_strategy: {
    label: "从卷战略开始",
    description: "沿用现有书级方向和角色，继续生成卷战略与卷骨架。",
  },
  structured_outline: {
    label: "从节奏 / 拆章开始",
    description: "沿用现有卷规划，继续生成节奏板、章节列表和章节细化。",
  },
};

const TAKEOVER_ENTRY_META: Record<
  DirectorTakeoverEntryStep,
  {
    label: string;
    description: string;
  }
> = {
  basic: {
    label: "项目设定",
    description: "从现有项目基础信息继续接管，优先补最早缺失的导演前置资产。",
  },
  story_macro: {
    label: "故事宏观规划",
    description: "围绕 Story Macro 和 Book Contract 继续或重跑书级规划。",
  },
  world: {
    label: "世界观准备",
    description: "围绕本书世界规则、势力和约束继续或重跑当前步骤。",
  },
  character: {
    label: "角色准备",
    description: "围绕角色阵容与应用继续或重跑当前步骤。",
  },
  outline: {
    label: "卷战略",
    description: "围绕卷战略与卷骨架继续或重跑当前步骤。",
  },
  structured: {
    label: "节奏 / 拆章",
    description: "围绕当前卷节奏板、章节列表和细化资源继续或重跑当前步骤。",
  },
  chapter: {
    label: "章节执行",
    description: "优先恢复当前章节批次或从已准备范围继续执行。",
  },
  pipeline: {
    label: "质量修复",
    description: "优先恢复当前修复批次，或承接待修章节继续推进。",
  },
};

function buildStoryMacroReadiness(
  novel: DirectorTakeoverNovelContext,
): Pick<DirectorTakeoverStageReadiness, "available" | "reason"> {
  if (hasMeaningfulSeedMaterial(novel)) {
    return {
      available: true,
      reason: "当前书级信息已具备，可以从故事宏观规划开始接管。",
    };
  }
  return {
    available: false,
    reason: "请至少补充一句故事概述、书级卖点、对标气质或前30章承诺，再启动自动接管。",
  };
}

function buildCharacterSetupReadiness(
  snapshot: DirectorTakeoverAssetSnapshot,
): Pick<DirectorTakeoverStageReadiness, "available" | "reason"> {
  if (!isStoryMacroReady(snapshot)) {
    return {
      available: false,
      reason: "跳过故事宏观规划前，需要先具备 Story Macro 与 Book Contract。",
    };
  }
  if (!snapshot.hasWorldSetupPrepared) {
    return {
      available: false,
      reason: "需要先完成世界观准备，才能直接从角色准备接管。",
    };
  }
  return {
    available: true,
    reason: "书级规划与世界观资产已齐，可以从角色准备继续接管。",
  };
}

function buildWorldSetupReadiness(
  snapshot: DirectorTakeoverAssetSnapshot,
): Pick<DirectorTakeoverStageReadiness, "available" | "reason"> {
  if (!isStoryMacroReady(snapshot)) {
    return {
      available: false,
      reason: "跳过故事宏观规划前，需要先具备 Story Macro 与 Book Contract。",
    };
  }
  return {
    available: true,
    reason: snapshot.hasWorldSetupPrepared
      ? "本书已绑定世界观，可以检查、完善或重新生成。"
      : "书级规划已齐，可以准备本书世界观。",
  };
}

function buildVolumeStrategyReadiness(
  snapshot: DirectorTakeoverAssetSnapshot,
): Pick<DirectorTakeoverStageReadiness, "available" | "reason"> {
  if (!isStoryMacroReady(snapshot)) {
    return {
      available: false,
      reason: "跳过前置阶段前，需要先具备 Story Macro 与 Book Contract。",
    };
  }
  if (!snapshot.hasWorldSetupPrepared) {
    return {
      available: false,
      reason: "从卷战略开始前，需要先完成世界观准备。",
    };
  }
  if (!isCharacterReady(snapshot)) {
    return {
      available: false,
      reason: "从卷战略开始前，至少需要 1 位已确认角色。",
    };
  }
  return {
    available: true,
    reason: "书级规划和角色资产已齐，可以从卷战略继续。",
  };
}

function buildStructuredOutlineReadiness(
  snapshot: DirectorTakeoverAssetSnapshot,
): Pick<DirectorTakeoverStageReadiness, "available" | "reason"> {
  if (!isStoryMacroReady(snapshot)) {
    return {
      available: false,
      reason: "跳过前置阶段前，需要先具备 Story Macro 与 Book Contract。",
    };
  }
  if (!snapshot.hasWorldSetupPrepared) {
    return {
      available: false,
      reason: "从节奏 / 拆章开始前，需要先完成世界观准备。",
    };
  }
  if (!isCharacterReady(snapshot)) {
    return {
      available: false,
      reason: "从节奏 / 拆章开始前，至少需要 1 位已确认角色。",
    };
  }
  if (!isOutlineReady(snapshot)) {
    return {
      available: false,
      reason: "从节奏 / 拆章开始前，需要先有卷战略 / 卷骨架。",
    };
  }
  return {
    available: true,
    reason: "卷级资产已存在，可以直接从节奏 / 拆章开始继续。",
  };
}

function resolveRecommendedTakeoverPhase(snapshot: DirectorTakeoverAssetSnapshot): DirectorTakeoverStartPhase {
  if (!isStoryMacroReady(snapshot)) {
    return "story_macro";
  }
  if (!snapshot.hasWorldSetupPrepared) {
    return "world_setup";
  }
  if (!isCharacterReady(snapshot)) {
    return "character_setup";
  }
  if (!isOutlineReady(snapshot)) {
    return "volume_strategy";
  }
  return "structured_outline";
}

function buildPreviewOrFallback(input: {
  entryStep: DirectorTakeoverEntryStep;
  strategy: DirectorTakeoverStrategy;
  snapshot: DirectorTakeoverAssetSnapshot;
  activePipelineJob?: DirectorTakeoverPipelineJobSnapshot | null;
  latestCheckpoint?: DirectorTakeoverCheckpointSnapshot | null;
  executableRange?: DirectorTakeoverExecutableRangeSnapshot | null;
}): DirectorTakeoverPreview {
  try {
    const plan = resolveDirectorTakeoverPlan(input);
    return {
      strategy: input.strategy,
      summary: plan.summary,
      effectSummary: plan.effectSummary,
      effectiveStep: plan.effectiveStep,
      effectiveStage: plan.effectiveStage,
      skipSteps: plan.skipSteps,
      continueStep: plan.currentStep ?? null,
      restartStep: plan.restartStep ?? null,
      usesCurrentBatch: plan.usesCurrentBatch,
      impactNotes: plan.impactNotes,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "当前条件下暂时不能从这一步接管。";
    return {
      strategy: input.strategy,
      summary: input.strategy === "continue_existing" ? "当前还不能继续已有进度。" : "当前还不能重跑这一步。",
      effectSummary: message,
      effectiveStep: input.entryStep,
      effectiveStage: entryStepToWorkflowStage(input.entryStep),
      skipSteps: [],
      continueStep: input.strategy === "continue_existing" ? input.entryStep : null,
      restartStep: input.strategy === "restart_current_step" ? input.entryStep : null,
      usesCurrentBatch: false,
      impactNotes: [message],
    };
  }
}

function buildEntryStepStatus(input: {
  step: DirectorTakeoverEntryStep;
  novel: DirectorTakeoverNovelContext;
  snapshot: DirectorTakeoverAssetSnapshot;
  activePipelineJob?: DirectorTakeoverPipelineJobSnapshot | null;
  latestCheckpoint?: DirectorTakeoverCheckpointSnapshot | null;
  executableRange?: DirectorTakeoverExecutableRangeSnapshot | null;
}): DirectorTakeoverEntryReadiness["status"] {
  const { snapshot } = input;
  if (input.step === "basic") {
    return hasMeaningfulSeedMaterial(input.novel) ? "ready" : "missing";
  }
  if (input.step === "story_macro") {
    if (snapshot.hasStoryMacroPlan && snapshot.hasBookContract) return "complete";
    if (snapshot.hasStoryMacroPlan || snapshot.hasBookContract) return "partial";
    return "missing";
  }
  if (input.step === "world") {
    if (!isStoryMacroReady(snapshot)) return "blocked";
    return snapshot.hasWorldSetupPrepared ? "complete" : "missing";
  }
  if (input.step === "character") {
    if (!isStoryMacroReady(snapshot) || !snapshot.hasWorldSetupPrepared) return "blocked";
    return isCharacterReady(snapshot) ? "complete" : "missing";
  }
  if (input.step === "outline") {
    if (!isStoryMacroReady(snapshot) || !snapshot.hasWorldSetupPrepared || !isCharacterReady(snapshot)) return "blocked";
    return isOutlineReady(snapshot) ? "complete" : "missing";
  }
  if (input.step === "structured") {
    if (!isStoryMacroReady(snapshot) || !snapshot.hasWorldSetupPrepared || !isCharacterReady(snapshot) || !isOutlineReady(snapshot)) return "blocked";
    if (snapshot.hasUnpreparedChaptersInRange) return "partial";
    if (hasExecutableRange(input)) return "complete";
    if (isStructuredSyncPending(snapshot)) return "partial";
    if (isStructuredReady(snapshot)) return "partial";
    if (hasAnyStructuredAsset(snapshot)) return "partial";
    return "missing";
  }
  if (input.step === "chapter") {
    if (!hasExecutableRange(input)) return "blocked";
    if (input.activePipelineJob) return "partial";
    if (hasExecutableRange(input)) return "ready";
    return "missing";
  }
  if (
    !hasExecutableRange(input)
    && !hasPendingRepairContext(input)
    && (snapshot.approvedChapterCount ?? 0) <= 0
  ) {
    return "blocked";
  }
  if (input.activePipelineJob || hasPendingRepairContext(input)) return "ready";
  if ((snapshot.approvedChapterCount ?? 0) > 0) return "complete";
  return "missing";
}

function buildEntryReason(input: {
  step: DirectorTakeoverEntryStep;
  status: DirectorTakeoverEntryReadiness["status"];
  snapshot: DirectorTakeoverAssetSnapshot;
  latestCheckpoint?: DirectorTakeoverCheckpointSnapshot | null;
  activePipelineJob?: DirectorTakeoverPipelineJobSnapshot | null;
  executableRange?: DirectorTakeoverExecutableRangeSnapshot | null;
}): string {
  if (input.step === "basic") {
    return "会优先检查当前项目已有资产，从最早缺失步骤开始继续。";
  }
  if (input.step === "story_macro") {
    return input.status === "complete"
      ? "Story Macro 与 Book Contract 已具备，继续模式会自动推进到下一缺失步骤。"
      : "当前可以从故事宏观规划开始接管。";
  }
  if (input.step === "world") {
    return input.status === "blocked"
      ? "需要先具备 Story Macro 与 Book Contract，才能直接从世界观准备接管。"
      : input.status === "complete"
        ? "世界观资产已具备，继续模式会自动推进到下一缺失步骤。"
        : "当前可以从世界观准备继续。";
  }
  if (input.step === "character") {
    return input.status === "blocked"
      ? "需要先具备故事宏观规划与世界观资产，才能直接从角色准备接管。"
      : input.status === "complete"
        ? "角色资产已具备，继续模式会自动推进到下一缺失步骤。"
        : "当前可以从角色准备继续。";
  }
  if (input.step === "outline") {
    return input.status === "blocked"
      ? "需要先具备故事宏观规划与角色资产，才能直接从卷战略接管。"
      : input.status === "complete"
        ? "卷战略资产已具备，继续模式会自动推进到下一缺失步骤。"
        : "当前可以从卷战略继续。";
  }
  if (input.step === "structured") {
    return input.status === "blocked"
      ? "需要先具备卷战略，才能直接从节奏 / 拆章接管。"
      : input.snapshot.hasUnpreparedChaptersInRange
        ? "目标范围内还有章节缺少完整细化，继续模式会先回到节奏 / 拆章补齐后再续写，已写正文会保留。"
        : hasExecutableRange(input)
          ? "当前卷节奏板、章节细化和执行区资源已具备，继续模式会直接转入章节执行。"
          : input.snapshot.structuredOutlineRecoveryStep === "chapter_sync"
          ? "当前卷节奏板和章节细化已具备，但还没同步到章节执行区，继续模式会先完成同步。"
          : input.snapshot.structuredOutlineRecoveryStep === "chapter_detail_bundle"
            ? "当前卷已有部分章节细化资源，继续模式会从未完成的章节细化继续。"
            : input.snapshot.firstVolumeBeatSheetReady
              ? "当前卷已有节奏板或章节列表基础，继续模式会补齐剩余拆章步骤。"
              : "当前可以从节奏 / 拆章继续。";
  }
  if (input.step === "chapter") {
    if (!hasExecutableRange(input)) {
      return "需要先完成节奏 / 拆章同步，把章节资源写入执行区后，才能从章节执行接管。";
    }
    if (input.activePipelineJob) {
      return "检测到活动中的章节批次，继续模式会优先恢复当前批次。";
    }
    if (input.latestCheckpoint?.checkpointType === "chapter_batch_ready" || input.executableRange) {
      return "检测到可执行章节范围，继续模式会按当前范围恢复或续跑。";
    }
    return "当前可以从章节执行接管。";
  }
  if (input.activePipelineJob) {
    return "检测到活动中的质量修复批次，继续模式会优先恢复当前批次。";
  }
  if (input.latestCheckpoint?.checkpointType === "chapter_batch_ready" || input.latestCheckpoint?.checkpointType === "replan_required") {
    return input.latestCheckpoint.checkpointType === "replan_required"
      ? "检测到最近的重规划检查点，继续模式会优先恢复待处理的重规划与后续批次。"
      : "检测到最近的章节批次检查点，继续模式会优先恢复待修章节。";
  }
  return "当前可以从质量修复接管。";
}

export function buildDirectorTakeoverReadiness(input: {
  novel: DirectorTakeoverNovelContext;
  snapshot: DirectorTakeoverAssetSnapshot;
  hasActiveTask: boolean;
  activeTaskId?: string | null;
  activePipelineJob?: DirectorTakeoverPipelineJobSnapshot | null;
  latestCheckpoint?: DirectorTakeoverCheckpointSnapshot | null;
  executableRange?: DirectorTakeoverExecutableRangeSnapshot | null;
}): DirectorTakeoverReadinessResponse {
  const recommendedPhase = resolveRecommendedTakeoverPhase(input.snapshot);
  const recommendedStep = phaseToEntryStep(recommendedPhase);
  const storyMacroReadiness = buildStoryMacroReadiness(input.novel);
  const worldSetupReadiness = buildWorldSetupReadiness(input.snapshot);
  const characterSetupReadiness = buildCharacterSetupReadiness(input.snapshot);
  const volumeStrategyReadiness = buildVolumeStrategyReadiness(input.snapshot);
  const structuredOutlineReadiness = buildStructuredOutlineReadiness(input.snapshot);

  const entrySteps: DirectorTakeoverEntryReadiness[] = DIRECTOR_TAKEOVER_ENTRY_STEPS.map((step) => {
    const status = buildEntryStepStatus({
      step,
      novel: input.novel,
      snapshot: input.snapshot,
      activePipelineJob: input.activePipelineJob,
      latestCheckpoint: input.latestCheckpoint,
      executableRange: input.executableRange,
    });
    const available = status !== "blocked";
    return {
      step,
      label: TAKEOVER_ENTRY_META[step].label,
      description: TAKEOVER_ENTRY_META[step].description,
      available,
      recommended: step === recommendedStep
        || (
          step === "chapter"
          && recommendedStep === "structured"
          && Boolean(input.executableRange)
          && !input.snapshot.hasUnpreparedChaptersInRange
        ),
      status,
      reason: buildEntryReason({
        step,
        status,
        snapshot: input.snapshot,
        activePipelineJob: input.activePipelineJob,
        latestCheckpoint: input.latestCheckpoint,
        executableRange: input.executableRange,
      }),
      previews: [
        buildPreviewOrFallback({
          entryStep: step,
          strategy: "continue_existing",
          snapshot: input.snapshot,
          activePipelineJob: input.activePipelineJob,
          latestCheckpoint: input.latestCheckpoint,
          executableRange: input.executableRange,
        }),
        buildPreviewOrFallback({
          entryStep: step,
          strategy: "restart_current_step",
          snapshot: input.snapshot,
          activePipelineJob: input.activePipelineJob,
          latestCheckpoint: input.latestCheckpoint,
          executableRange: input.executableRange,
        }),
      ],
    };
  });

  return {
    novelId: input.novel.id,
    novelTitle: input.novel.title.trim() || "当前项目",
    hasActiveTask: input.hasActiveTask,
    activeTaskId: input.activeTaskId ?? null,
    snapshot: {
      ...input.snapshot,
    },
    stages: ([
      ["story_macro", storyMacroReadiness],
      ["world_setup", worldSetupReadiness],
      ["character_setup", characterSetupReadiness],
      ["volume_strategy", volumeStrategyReadiness],
      ["structured_outline", structuredOutlineReadiness],
    ] as const).map(([phase, readiness]) => ({
      phase,
      label: DIRECTOR_TAKEOVER_STAGE_META[phase].label,
      description: DIRECTOR_TAKEOVER_STAGE_META[phase].description,
      available: readiness.available,
      recommended: readiness.available && phase === recommendedPhase,
      reason: readiness.reason,
    })),
    entrySteps,
    activePipelineJob: input.activePipelineJob ?? null,
    latestCheckpoint: input.latestCheckpoint ?? null,
    executableRange: input.executableRange ?? null,
  };
}

export function assertDirectorTakeoverPhaseAvailable(
  readiness: DirectorTakeoverReadinessResponse,
  phase: DirectorTakeoverStartPhase,
): void {
  const targetStage = readiness.stages.find((item) => item.phase === phase);
  if (!targetStage) {
    throw new Error("当前自动导演接管阶段不存在。");
  }
  if (!targetStage.available) {
    throw new Error(targetStage.reason || "当前项目还不适合从该阶段继续自动导演。");
  }
}
