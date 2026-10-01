import type { DirectorChapterExecutionProgressSummary, DirectorRuntimeProgressBreakdown, DirectorRuntimeSnapshot, DirectorTaskFactSummary, DirectorStepRun, DirectorWorkspaceInventory } from "@novelfoundry/shared/types/directorRuntime";
import { latestStep } from "./eventStatus";

const PLANNING_NODE_HINTS = [
  "book_contract",
  "story_macro",
  "character",
  "volume_strategy",
  "chapter_task",
  "structured",
];

const CHAPTER_EXECUTION_NODE_HINTS = [
  "chapter_execution",
  "chapter.write",
  "chapter_draft",
];

const QUALITY_NODE_HINTS = [
  "quality",
  "review",
  "repair",
  "state_commit",
];

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function percentFromCount(done: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return clampPercent((done / total) * 100);
}

function stepMatches(step: DirectorStepRun, hints: string[]): boolean {
  const nodeKey = step.nodeKey.toLowerCase();
  return hints.some((hint) => nodeKey.includes(hint));
}

function stepProgressPercent(steps: DirectorStepRun[], hints: string[]): number {
  const matched = steps.filter((step) => stepMatches(step, hints));
  if (matched.length === 0) {
    return 0;
  }
  const completed = matched.filter((step) => step.status === "succeeded").length;
  const running = matched.some((step) => step.status === "running" || step.status === "waiting_approval")
    ? 0.5
    : 0;
  return percentFromCount(completed + running, matched.length);
}

function buildPlanningPercent(
  snapshot: DirectorRuntimeSnapshot,
  inventory: DirectorWorkspaceInventory | null | undefined,
  factSummary?: DirectorTaskFactSummary | null,
): number {
  if (factSummary) {
    const completed = [
      factSummary.hasBookContract,
      factSummary.hasStoryMacro,
      factSummary.characterCount > 0,
      factSummary.hasVolumeStrategy,
      factSummary.outlineFacts.plannedChapterCount > 0,
    ].filter(Boolean).length;
    return percentFromCount(completed, 5);
  }
  if (inventory) {
    const completed = [
      inventory.hasBookContract,
      inventory.hasStoryMacro,
      inventory.hasCharacters,
      inventory.hasVolumeStrategy,
      inventory.hasChapterPlan,
    ].filter(Boolean).length;
    return percentFromCount(completed, 5);
  }
  return stepProgressPercent(snapshot.steps, PLANNING_NODE_HINTS);
}

function buildChapterExecutionPercent(
  snapshot: DirectorRuntimeSnapshot,
  inventory: DirectorWorkspaceInventory | null | undefined,
  factSummary?: DirectorTaskFactSummary | null,
): number {
  if (factSummary) {
    return clampPercent(factSummary.chapterExecutionFacts.ratio * 100);
  }
  if (inventory?.chapterCount) {
    const continuableChapters = Math.max(
      inventory.approvedChapterCount,
      inventory.draftedChapterCount - inventory.pendingRepairChapterCount,
    );
    return percentFromCount(continuableChapters, inventory.chapterCount);
  }
  return stepProgressPercent(snapshot.steps, CHAPTER_EXECUTION_NODE_HINTS);
}

function buildChapterExecutionPercentFromFacts(chapterProgress: DirectorChapterExecutionProgressSummary | null | undefined): number | null {
  if (!chapterProgress) {
    return null;
  }
  return clampPercent(chapterProgress.ratio * 100);
}

function buildQualityRepairPercent(
  snapshot: DirectorRuntimeSnapshot,
  inventory: DirectorWorkspaceInventory | null | undefined,
  factSummary?: DirectorTaskFactSummary | null,
): number {
  if (factSummary) {
    if (factSummary.repairFacts.draftedChapterCount <= 0) {
      return 0;
    }
    return percentFromCount(
      Math.max(0, factSummary.repairFacts.draftedChapterCount - factSummary.repairFacts.needsRepairChapters),
      factSummary.repairFacts.draftedChapterCount,
    );
  }
  if (inventory) {
    if (inventory.draftedChapterCount <= 0) {
      return 0;
    }
    return percentFromCount(
      Math.max(0, inventory.draftedChapterCount - inventory.pendingRepairChapterCount),
      inventory.draftedChapterCount,
    );
  }
  const percent = stepProgressPercent(snapshot.steps, QUALITY_NODE_HINTS);
  return percent > 0 ? percent : 100;
}

function buildQualityRepairPercentFromFacts(chapterProgress: DirectorChapterExecutionProgressSummary | null | undefined): number | null {
  if (!chapterProgress?.chapters?.length) {
    return null;
  }
  const repairedCount = chapterProgress.chapters.filter((chapter) => (
    chapter.completedStages.includes("repair_completed_or_not_needed")
  )).length;
  return percentFromCount(repairedCount, chapterProgress.chapters.length);
}

function buildActiveJobPercent(snapshot: DirectorRuntimeSnapshot): number {
  const step = latestStep(snapshot.steps);
  if (!step) {
    return 0;
  }
  if (step.status === "succeeded") {
    return 100;
  }
  if (step.status === "running") {
    return 1;
  }
  return 0;
}

export function buildProgressBreakdown(
  snapshot: DirectorRuntimeSnapshot,
  inventory: DirectorWorkspaceInventory | null | undefined,
  chapterProgress?: DirectorChapterExecutionProgressSummary | null,
  factSummary?: DirectorTaskFactSummary | null,
): DirectorRuntimeProgressBreakdown {
  const completedSteps = factSummary?.completedStepCount ?? snapshot.steps.filter((step) => step.status === "succeeded").length;
  const planningPercent = buildPlanningPercent(snapshot, inventory, factSummary);
  const chapterExecutionPercent = buildChapterExecutionPercentFromFacts(chapterProgress)
    ?? buildChapterExecutionPercent(snapshot, inventory, factSummary);
  const qualityRepairPercent = buildQualityRepairPercentFromFacts(chapterProgress)
    ?? buildQualityRepairPercent(snapshot, inventory, factSummary);
  const activeJobProgress = buildActiveJobPercent(snapshot);
  const totalPercent = clampPercent(
    planningPercent * 0.35
    + chapterExecutionPercent * 0.5
    + qualityRepairPercent * 0.15,
  );
  const draftedChapters = inventory?.draftedChapterCount ?? 0;
  const continuableChapters = inventory
    ? Math.max(
      inventory.approvedChapterCount,
      inventory.draftedChapterCount - inventory.pendingRepairChapterCount,
    )
    : 0;
  const totalChapters = inventory?.chapterCount ?? 0;
  const pendingRepairChapters = inventory?.pendingRepairChapterCount ?? 0;
  return {
    planningProgress: planningPercent,
    chapterProgress: chapterExecutionPercent,
    qualityProgress: qualityRepairPercent,
    activeJobProgress,
    planningPercent,
    chapterExecutionPercent,
    qualityRepairPercent,
    totalPercent,
    completedSteps,
    totalSteps: factSummary?.totalStepCount ?? snapshot.steps.length,
    draftedChapters,
    continuableChapters,
    totalChapters,
    pendingRepairChapters,
    explanation: totalChapters > 0
      ? `章节进度 ${continuableChapters}/${totalChapters}，规划 ${planningPercent}%，质量修复 ${qualityRepairPercent}%，综合进度 ${totalPercent}%。`
      : `规划 ${planningPercent}%，章节执行 ${chapterExecutionPercent}%，质量修复 ${qualityRepairPercent}%，综合进度 ${totalPercent}%。`,
  };
}
