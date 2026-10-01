import type { AiWorkspaceInterpretation, DirectorWorkspaceInventory } from "@novelfoundry/shared/types/directorRuntime";

/**
 * 从 inventory 计算事实型工作区解读，用于进度展示、非 AI 模式和 LLM 结构化解读的兜底。
 * 真正需要策略判断的入口仍可通过 includeAiInterpretation 显式启用注册提示词。
 */
export function computeWorkspaceInterpretation(
  inventory: DirectorWorkspaceInventory,
): AiWorkspaceInterpretation {
  const stage = resolveProductionStage(inventory);
  const action = resolveRecommendedAction(inventory, stage);
  const protectedContent: string[] = [];
  if (inventory.draftedChapterCount > 0) {
    protectedContent.push("已有章节正文");
  }
  for (const artifact of inventory.protectedUserContentArtifacts) {
    protectedContent.push(artifact.id);
  }

  return {
    productionStage: stage,
    missingArtifacts: inventory.missingArtifactTypes as AiWorkspaceInterpretation["missingArtifacts"],
    staleArtifacts: inventory.staleArtifacts.map(
      (a) => a.artifactType,
    ) as AiWorkspaceInterpretation["staleArtifacts"],
    protectedUserContent: protectedContent,
    recommendedAction: action,
    confidence: 1,
    evidenceRefs: ["workspace_inventory"],
    summary: buildDeterministicSummary(inventory, stage, action),
    riskNotes: buildRiskNotes(inventory),
  };
}

function resolveProductionStage(
  inv: DirectorWorkspaceInventory,
): AiWorkspaceInterpretation["productionStage"] {
  if (inv.pendingRepairChapterCount > 0) return "needs_repair";
  if (inv.draftedChapterCount > 0) return "has_drafts";
  if (inv.hasChapterPlan) return "has_chapter_plan";
  if (inv.hasVolumeStrategy) return "has_volume_plan";
  if (inv.hasCharacters) return "has_characters";
  if (inv.hasStoryMacro) return "has_macro";
  if (inv.hasBookContract) return "has_contract";
  if (inv.chapterCount > 0 || inv.hasWorldBinding || inv.hasSourceKnowledge) return "has_seed";
  return "empty";
}

function resolveRecommendedAction(
  inv: DirectorWorkspaceInventory,
  stage: AiWorkspaceInterpretation["productionStage"],
): AiWorkspaceInterpretation["recommendedAction"] {
  if (stage === "needs_repair") {
    return {
      action: "repair_scope",
      reason: `${inv.pendingRepairChapterCount} 章待修复，应先处理修复任务再继续生产。`,
      affectedScope: `${inv.pendingRepairChapterCount} chapters`,
      riskLevel: inv.pendingRepairChapterCount > 5 ? "medium" : "low",
    };
  }
  if (stage === "has_drafts") {
    const undrafted = inv.chapterCount - inv.draftedChapterCount;
    if (undrafted > 0) {
      return {
        action: "continue_chapter_execution",
        reason: `已有 ${inv.draftedChapterCount} 章草稿，还有 ${undrafted} 章待写。`,
        affectedScope: "novel",
        riskLevel: "low",
      };
    }
    return {
      action: "review_recent_chapters",
      reason: `全部 ${inv.chapterCount} 章已有草稿，建议审校。`,
      affectedScope: "novel",
      riskLevel: "low",
    };
  }
  if (stage === "has_chapter_plan") {
    return {
      action: "continue_chapter_execution",
      reason: "章节规划已完成，可以开始章节执行。",
      affectedScope: "novel",
      riskLevel: "low",
    };
  }
  if (stage === "has_volume_plan") {
    return {
      action: "build_chapter_tasks",
      reason: "卷策略已完成，需要生成章节任务单。",
      affectedScope: "novel",
      riskLevel: "low",
    };
  }
  if (stage === "has_characters") {
    return {
      action: "build_volume_strategy",
      reason: "角色已准备，需要制定卷策略。",
      affectedScope: "novel",
      riskLevel: "low",
    };
  }
  if (stage === "has_macro") {
    return {
      action: "prepare_characters",
      reason: "故事主线已完成，需要准备角色。",
      affectedScope: "novel",
      riskLevel: "low",
    };
  }
  if (stage === "has_contract") {
    return {
      action: "complete_story_macro",
      reason: "书约已完成，需要制定故事主线。",
      affectedScope: "novel",
      riskLevel: "low",
    };
  }
  if (stage === "has_seed") {
    return {
      action: "create_book_contract",
      reason: "有初始资产但缺少书约，先建立书约。",
      affectedScope: "novel",
      riskLevel: "low",
    };
  }
  return {
    action: "generate_candidates",
    reason: "工作区为空，从生成候选方向开始。",
    affectedScope: "novel",
    riskLevel: "low",
  };
}

function buildDeterministicSummary(
  inv: DirectorWorkspaceInventory,
  stage: AiWorkspaceInterpretation["productionStage"],
  action: AiWorkspaceInterpretation["recommendedAction"],
): string {
  const parts: string[] = [];
  parts.push(`当前阶段: ${stage}`);
  if (inv.chapterCount > 0) {
    parts.push(`章节 ${inv.draftedChapterCount}/${inv.chapterCount} 已有草稿`);
  }
  if (inv.approvedChapterCount > 0) {
    parts.push(`${inv.approvedChapterCount} 章已通过`);
  }
  if (inv.pendingRepairChapterCount > 0) {
    parts.push(`${inv.pendingRepairChapterCount} 章待修复`);
  }
  parts.push(`下一步: ${action.reason}`);
  return parts.join("，");
}

function buildRiskNotes(inv: DirectorWorkspaceInventory): string[] {
  const notes: string[] = [];
  if (inv.staleArtifacts.length > 0) {
    notes.push(`${inv.staleArtifacts.length} 个资产已过期，可能需要更新。`);
  }
  if (inv.pendingRepairChapterCount > 5) {
    notes.push(`待修复章节较多 (${inv.pendingRepairChapterCount})，建议优先处理。`);
  }
  if (inv.draftedChapterCount > 0 && inv.protectedUserContentArtifacts.length > 0) {
    notes.push("存在用户保护内容，修复时需避免覆盖。");
  }
  return notes;
}
