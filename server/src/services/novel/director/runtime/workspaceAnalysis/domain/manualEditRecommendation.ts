import type { DirectorManualEditImpact, DirectorWorkspaceAnalysis } from "@novelfoundry/shared/types/directorRuntime";

export function buildManualEditRecommendation(impact: DirectorManualEditImpact): DirectorWorkspaceAnalysis["recommendation"] {
  if (impact.changedChapters.length === 0) {
    return {
      action: "continue_chapter_execution",
      reason: "没有检测到需要处理的手动正文改动，可以继续当前生产链路。",
      affectedScope: "novel",
      riskLevel: "low",
    };
  }
  return {
    action: impact.requiresApproval ? "ask_user_confirmation" : "review_recent_chapters",
    reason: impact.summary,
    affectedScope: impact.changedChapters.map((chapter) => `chapter:${chapter.chapterId}`).join(","),
    riskLevel: impact.impactLevel === "high" ? "high" : impact.impactLevel === "medium" ? "medium" : "low",
  };
}
