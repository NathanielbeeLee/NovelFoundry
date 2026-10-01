import type { DirectorTakeoverEntryStep, DirectorTakeoverExecutableRangeSnapshot, DirectorTakeoverPipelineJobSnapshot, DirectorTakeoverStrategy, DirectorTakeoverCheckpointSnapshot } from "@novelfoundry/shared/types/novelDirector";
import { hasExecutableRange, hasPendingRepairContext, isStoryMacroReady, isCharacterReady, isOutlineReady } from "./assetReadiness";
import type { DirectorTakeoverAssetSnapshot, DirectorTakeoverResolvedPlan, DirectorTakeoverDecisionInput } from "./contracts";
import { entryStepToLegacyStartPhase, entryStepToWorkflowStage, buildSkipSteps } from "./stageMapping";

function resolveExecutionContinuationStep(input: {
  snapshot: DirectorTakeoverAssetSnapshot;
  activePipelineJob?: DirectorTakeoverPipelineJobSnapshot | null;
  latestCheckpoint?: DirectorTakeoverCheckpointSnapshot | null;
  executableRange?: DirectorTakeoverExecutableRangeSnapshot | null;
  preferPipeline: boolean;
}): DirectorTakeoverEntryStep | null {
  const executable = hasExecutableRange(input);
  if (!executable) {
    return null;
  }
  const pendingRepair = hasPendingRepairContext(input);
  if (pendingRepair) {
    return "pipeline";
  }
  // 目标范围内仍有未细化章节、且当前没有进行中的批次时，先回到节奏 / 拆章补齐细化，
  // 而不是直接进入章节执行——否则会因「缺少完整章节细化」抛错卡死，且无法自动补齐。
  if (input.snapshot.hasUnpreparedChaptersInRange && !input.activePipelineJob) {
    return null;
  }
  if (input.preferPipeline) {
    return "chapter";
  }
  return "chapter";
}

function resolveContinueTargetStep(input: {
  entryStep: DirectorTakeoverEntryStep;
  selectedEntryStep?: DirectorTakeoverEntryStep;
  snapshot: DirectorTakeoverAssetSnapshot;
  activePipelineJob?: DirectorTakeoverPipelineJobSnapshot | null;
  latestCheckpoint?: DirectorTakeoverCheckpointSnapshot | null;
  executableRange?: DirectorTakeoverExecutableRangeSnapshot | null;
}): DirectorTakeoverEntryStep {
  const storyReady = isStoryMacroReady(input.snapshot);
  const worldReady = input.snapshot.hasWorldSetupPrepared;
  const characterReady = isCharacterReady(input.snapshot);
  const outlineReady = isOutlineReady(input.snapshot);
  const structuredExecutionReady = hasExecutableRange(input);

  if (input.entryStep === "basic") {
    if (!storyReady) return "story_macro";
    if (!worldReady) return "world";
    if (!characterReady) return "character";
    if (!outlineReady) return "outline";
    if (!structuredExecutionReady) return "structured";
    return resolveExecutionContinuationStep({
      ...input,
      preferPipeline: false,
    }) ?? "structured";
  }
  if (input.entryStep === "story_macro") {
    if (!storyReady) return "story_macro";
    return resolveContinueTargetStep({ ...input, selectedEntryStep: input.selectedEntryStep ?? input.entryStep, entryStep: "world" });
  }
  if (input.entryStep === "world") {
    if (!storyReady) return "story_macro";
    if (!worldReady) return "world";
    return resolveContinueTargetStep({ ...input, selectedEntryStep: input.selectedEntryStep ?? input.entryStep, entryStep: "character" });
  }
  if (input.entryStep === "character") {
    if (!worldReady) return "world";
    if (!characterReady) return "character";
    return resolveContinueTargetStep({ ...input, selectedEntryStep: input.selectedEntryStep ?? input.entryStep, entryStep: "outline" });
  }
  if (input.entryStep === "outline") {
    if (!outlineReady) return "outline";
    return resolveContinueTargetStep({ ...input, selectedEntryStep: input.selectedEntryStep ?? input.entryStep, entryStep: "structured" });
  }
  if (input.entryStep === "structured") {
    if ((input.selectedEntryStep ?? input.entryStep) === "structured") return "structured";
    if (!structuredExecutionReady) return "structured";
    return resolveExecutionContinuationStep({
      ...input,
      preferPipeline: false,
    }) ?? "structured";
  }
  if (input.entryStep === "chapter") {
    return resolveExecutionContinuationStep({
      ...input,
      preferPipeline: false,
    }) ?? "structured";
  }
  return resolveExecutionContinuationStep({
    ...input,
    preferPipeline: true,
  }) ?? "structured";
}

function buildPhasePlan(input: {
  entryStep: DirectorTakeoverEntryStep;
  strategy: DirectorTakeoverStrategy;
  effectiveStep: Extract<DirectorTakeoverEntryStep, "story_macro" | "world" | "character" | "outline" | "structured">;
  summary: string;
  effectSummary: string;
  impactNotes: string[];
}): DirectorTakeoverResolvedPlan {
  const startPhase = entryStepToLegacyStartPhase(input.effectiveStep);
  return {
    entryStep: input.entryStep,
    strategy: input.strategy,
    effectiveStep: input.effectiveStep,
    effectiveStage: entryStepToWorkflowStage(input.effectiveStep),
    startPhase,
    phase: startPhase,
    resumeStage: input.effectiveStep,
    skipSteps: buildSkipSteps(input.entryStep, input.effectiveStep),
    summary: input.summary,
    effectSummary: input.effectSummary,
    impactNotes: input.impactNotes,
    usesCurrentBatch: false,
    currentStep: input.strategy === "continue_existing" ? input.effectiveStep : null,
    restartStep: input.strategy === "restart_current_step" ? input.effectiveStep : null,
    executionMode: "phase",
    resumeCheckpointType: null,
  };
}

function buildAutoExecutionPlan(input: {
  entryStep: DirectorTakeoverEntryStep;
  strategy: DirectorTakeoverStrategy;
  effectiveStep: "chapter" | "pipeline";
  usesCurrentBatch: boolean;
  summary: string;
  effectSummary: string;
  impactNotes: string[];
  latestCheckpoint?: DirectorTakeoverCheckpointSnapshot | null;
}): DirectorTakeoverResolvedPlan {
  const effectiveStage = input.effectiveStep === "pipeline" ? "quality_repair" : "chapter_execution";
  return {
    entryStep: input.entryStep,
    strategy: input.strategy,
    effectiveStep: input.effectiveStep,
    effectiveStage,
    startPhase: "structured_outline",
    resumeStage: input.effectiveStep,
    skipSteps: buildSkipSteps(input.entryStep, input.effectiveStep),
    summary: input.summary,
    effectSummary: input.effectSummary,
    impactNotes: input.impactNotes,
    usesCurrentBatch: input.usesCurrentBatch,
    currentStep: input.strategy === "continue_existing" ? input.effectiveStep : null,
    restartStep: input.strategy === "restart_current_step" ? input.entryStep : null,
    executionMode: "auto_execution",
    resumeCheckpointType: input.latestCheckpoint?.checkpointType ?? null,
  };
}

export function resolveDirectorTakeoverPlan(input: DirectorTakeoverDecisionInput): DirectorTakeoverResolvedPlan {
  const storyReady = isStoryMacroReady(input.snapshot);
  const worldReady = input.snapshot.hasWorldSetupPrepared;
  const characterReady = isCharacterReady(input.snapshot);
  const outlineReady = isOutlineReady(input.snapshot);
  const executable = hasExecutableRange(input);
  const pendingRepair = hasPendingRepairContext(input);

  if (input.strategy === "continue_existing") {
    const effectiveStep = resolveContinueTargetStep(input);
    if (effectiveStep === "story_macro") {
      return buildPhasePlan({
        entryStep: input.entryStep,
        strategy: input.strategy,
        effectiveStep,
        summary: "继续已有进度，先补齐故事宏观规划。",
        effectSummary: "会复用当前基础信息，只补缺失的 Story Macro 与 Book Contract。",
        impactNotes: ["不会清空已有章节与正文。"],
      });
    }
    if (effectiveStep === "character") {
      return buildPhasePlan({
        entryStep: input.entryStep,
        strategy: input.strategy,
        effectiveStep,
        summary: "继续已有进度，接着补角色准备。",
        effectSummary: "会复用已完成的书级规划，只补角色阵容与角色应用。",
        impactNotes: ["不会重跑已存在的 Story Macro / Book Contract。"],
      });
    }
    if (effectiveStep === "world") {
      return buildPhasePlan({
        entryStep: input.entryStep,
        strategy: input.strategy,
        effectiveStep,
        summary: "继续已有进度，接着准备世界观。",
        effectSummary: "会复用 Story Macro 与 Book Contract，生成或绑定本书使用的世界观资产。",
        impactNotes: ["不会清空已有书级规划与正文。"],
      });
    }
    if (effectiveStep === "outline") {
      return buildPhasePlan({
        entryStep: input.entryStep,
        strategy: input.strategy,
        effectiveStep,
        summary: "继续已有进度，接着补卷战略。",
        effectSummary: "会复用现有书级规划与角色资产，只补卷战略和卷骨架。",
        impactNotes: ["不会清空已存在的角色与正文。"],
      });
    }
    if (effectiveStep === "structured") {
      return buildPhasePlan({
        entryStep: input.entryStep,
        strategy: input.strategy,
        effectiveStep,
        summary: "继续已有进度，接着补节奏 / 拆章。",
        effectSummary: "会复用已完成的卷战略，只补当前卷节奏板、章节列表、章节细化或同步步骤。",
        impactNotes: ["保留已有正文，不会批量删章节。"],
      });
    }
    if (!executable) {
      throw new Error("当前还没有可继续的章节执行范围，请先补齐节奏 / 拆章资源。");
    }
    if (effectiveStep === "pipeline") {
      return buildAutoExecutionPlan({
        entryStep: input.entryStep,
        strategy: input.strategy,
        effectiveStep,
        usesCurrentBatch: true,
        latestCheckpoint: input.latestCheckpoint,
        summary: "继续已有进度，优先恢复当前质量修复批次。",
        effectSummary: "会优先恢复当前修复中的批次或待修章节，不会新开一条重复任务。",
        impactNotes: ["保留现有正文与规划资产。", "只会跳过已正式通过的章节。"],
      });
    }
    return buildAutoExecutionPlan({
      entryStep: input.entryStep,
      strategy: input.strategy,
      effectiveStep: "chapter",
      usesCurrentBatch: executable,
      latestCheckpoint: input.latestCheckpoint,
      summary: "继续已有进度，优先恢复当前章节批次。",
      effectSummary: "会优先恢复活动中的批次、检查点或已准备好的章节范围继续执行。",
      impactNotes: ["不会清空已有正文。", "只会跳过 approved / published 的章节。"],
    });
  }

  if (input.entryStep === "basic" || input.entryStep === "story_macro") {
    return buildPhasePlan({
      entryStep: input.entryStep,
      strategy: input.strategy,
      effectiveStep: "story_macro",
      summary: "重新生成当前步，从故事宏观规划重跑。",
      effectSummary: "会先清空 Story Macro 与 Book Contract，再从故事宏观规划重跑。",
      impactNotes: ["会刷新当前书级规划资产。", "不会删除已写正文。"],
    });
  }
  if (input.entryStep === "world") {
    if (!storyReady) {
      throw new Error("当前缺少 Story Macro 或 Book Contract，不能直接从世界观准备重跑。");
    }
    return buildPhasePlan({
      entryStep: input.entryStep,
      strategy: input.strategy,
      effectiveStep: "world",
      summary: "重新生成当前步，从世界观准备重跑。",
      effectSummary: "会重新生成或替换本书世界观资产，再让后续角色准备使用新的世界约束。",
      impactNotes: ["保留 Story Macro 与 Book Contract。", "不会删除已有正文。"],
    });
  }
  if (input.entryStep === "character") {
    if (!storyReady || !worldReady) {
      throw new Error("当前缺少故事宏观规划或世界观资产，不能直接从角色准备重跑。");
    }
    return buildPhasePlan({
      entryStep: input.entryStep,
      strategy: input.strategy,
      effectiveStep: "character",
      summary: "重新生成当前步，从角色准备重跑。",
      effectSummary: "会先清空当前角色阵容、关系和角色准备候选，再重跑角色准备。",
      impactNotes: ["保留前置书级规划。", "不会清空已有正文。"],
    });
  }
  if (input.entryStep === "outline") {
    if (!storyReady || !worldReady || !characterReady) {
      throw new Error("当前前置资产不足，不能直接从卷战略重跑。");
    }
    return buildPhasePlan({
      entryStep: input.entryStep,
      strategy: input.strategy,
      effectiveStep: "outline",
      summary: "重新生成当前步，从卷战略重跑。",
      effectSummary: "会先清空当前卷战略与卷骨架，再从卷战略重跑。",
      impactNotes: ["保留前置书级规划与角色。", "不会清空已有正文。"],
    });
  }
  if (input.entryStep === "structured") {
    if (!storyReady || !worldReady || !characterReady || !outlineReady) {
      throw new Error("当前前置资产不足，不能直接从节奏 / 拆章重跑。");
    }
    return buildPhasePlan({
      entryStep: input.entryStep,
      strategy: input.strategy,
      effectiveStep: "structured",
      summary: "重新生成当前步，从节奏 / 拆章重跑。",
      effectSummary: "会先清空当前卷的节奏板、章节列表和章节细化资源，再重跑这一阶段。",
      impactNotes: ["会清空当前卷尚未开写的拆章产物。", "不会删除已写正文。"],
    });
  }
  if (!executable) {
    throw new Error("当前还没有可执行的章节范围，不能直接新开章节批次。");
  }
  if (input.entryStep === "pipeline" && !pendingRepair && !executable) {
    throw new Error("当前没有可继续的质量修复上下文。");
  }
  return buildAutoExecutionPlan({
    entryStep: input.entryStep,
    strategy: input.strategy,
    effectiveStep: input.entryStep === "pipeline" ? "pipeline" : "chapter",
    usesCurrentBatch: false,
    latestCheckpoint: input.latestCheckpoint,
    summary: input.entryStep === "pipeline" ? "重新生成当前步，清空当前质量修复结果后重跑。" : "重新生成当前步，清空当前章节批次后重跑。",
    effectSummary: input.entryStep === "pipeline"
      ? "会先清空当前质量修复结果与通过状态，再对现有正文重新审校 / 修复。"
      : "会先清空当前章节执行范围的正文草稿、审校状态和派生摘要，再重新生成这一批。",
    impactNotes: input.entryStep === "pipeline"
      ? ["保留当前章节正文。", "会重新进入自动审校与修复。"]
      : ["会清空当前批次正文草稿。", "保留前置规划和章节结构。"],
  });
}
