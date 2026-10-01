import type { DirectorArtifactType, DirectorAutopilotRecoveryDecision, DirectorEvent, DirectorRuntimeProjectionStatus, DirectorRuntimeSnapshot, DirectorRuntimeVisibleRiskBadge, DirectorWorkspaceInventory } from "@novelfoundry/shared/types/directorRuntime";
import { classifyChapterQualityLoopRisk } from "@novelfoundry/shared/types/chapterQualityLoop";

const PLANNING_ARTIFACT_TYPES: DirectorArtifactType[] = [
  "book_contract",
  "story_macro",
  "character_cast",
  "volume_strategy",
  "chapter_task_sheet",
];

export function buildRecoveryDecision(input: {
  status: DirectorRuntimeProjectionStatus;
  inventory: DirectorWorkspaceInventory | null | undefined;
  blockedReason: string | null;
  qualityDebtCount?: number;
}): DirectorAutopilotRecoveryDecision {
  const protectedCount = input.inventory?.protectedUserContentArtifacts.length ?? 0;
  if (protectedCount > 0 && (input.status === "waiting_approval" || input.status === "blocked" || input.status === "failed")) {
    return "requires_manual_recovery";
  }
  if (input.status === "failed") {
    return "requires_manual_recovery";
  }
  if ((input.inventory?.pendingRepairChapterCount ?? 0) > 0) {
    return "auto_repair_chapter";
  }
  const missingArtifacts = input.inventory?.missingArtifactTypes ?? [];
  if (missingArtifacts.some((type) => PLANNING_ARTIFACT_TYPES.includes(type))) {
    return "auto_replan_window";
  }
  if ((input.qualityDebtCount ?? 0) > 0) {
    return "defer_and_continue";
  }
  if (input.status === "waiting_approval" || input.status === "blocked") {
    return input.blockedReason ? "auto_resume_from_checkpoint" : "continue";
  }
  return "continue";
}

export function isAutomaticPolicy(snapshot: DirectorRuntimeSnapshot): boolean {
  return snapshot.policy.mode === "auto_safe_scope";
}

export function buildVisibleRiskBadges(input: {
  status: DirectorRuntimeProjectionStatus;
  blockedReason: string | null;
  inventory: DirectorWorkspaceInventory | null | undefined;
  events: DirectorEvent[];
}): DirectorRuntimeVisibleRiskBadge[] {
  const badges: DirectorRuntimeVisibleRiskBadge[] = [];
  const push = (badge: DirectorRuntimeVisibleRiskBadge) => {
    if (!badges.some((item) => item.label === badge.label)) {
      badges.push(badge);
    }
  };
  if (input.status === "failed") {
    push({ label: "执行失败", level: "danger", source: "status" });
  } else if (input.status === "blocked" || input.status === "waiting_approval") {
    push({ label: input.blockedReason ? "等待处理" : "等待确认", level: "warning", source: "status" });
  }
  const inventory = input.inventory;
  if (inventory) {
    if (inventory.protectedUserContentArtifacts.length > 0) {
      push({ label: "受保护正文", level: "danger", source: "artifact" });
    }
    if (inventory.pendingRepairChapterCount > 0) {
      push({ label: `${inventory.pendingRepairChapterCount} 章待修复`, level: "warning", source: "artifact" });
    }
    if (inventory.staleArtifacts.length > 0) {
      push({ label: `${inventory.staleArtifacts.length} 项需复核`, level: "warning", source: "artifact" });
    }
    if (inventory.missingArtifactTypes.length > 0) {
      push({ label: "缺少规划资源", level: "warning", source: "artifact" });
    }
  }
  for (const event of input.events) {
    if (event.type === "quality_issue_found" || event.type === "quality_loop_assessed") {
      const qualityLoopRisk = event.type === "quality_loop_assessed"
        ? classifyChapterQualityLoopRisk((event.metadata?.assessment as unknown) ?? null)
        : "blocking";
      if (qualityLoopRisk === "non_blocking_quality_debt") {
        push({ label: "已暂存质量债", level: "info", source: "event" });
      } else if (qualityLoopRisk === "blocking") {
        push({ label: "质量阻塞", level: event.severity === "high" ? "danger" : "warning", source: "event" });
      } else if (event.type === "quality_issue_found") {
        push({ label: "质量风险", level: event.severity === "high" ? "danger" : "warning", source: "event" });
      }
    }
    if (event.type === "replan_run_created") {
      push({ label: "已进入重规划", level: "info", source: "event" });
    }
    if (event.type === "circuit_breaker_opened") {
      push({ label: "连续失败保护", level: "danger", source: "event" });
    }
  }
  for (const event of input.events) {
    if (event.type === "continue_with_risk") {
      push({ label: "已暂存质量债", level: "info", source: "event" });
    }
  }
  return badges.slice(0, 6);
}
