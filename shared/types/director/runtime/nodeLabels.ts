const DIRECTOR_NODE_DISPLAY_LABELS: Record<string, string> = {
  candidate_generation: "生成书级方向",
  candidate_refine: "细化书级方向",
  candidate_patch: "修正书级方向",
  candidate_title_refine: "优化书名",
  novel_create: "创建小说项目",
  takeover_execution: "接管已有项目",
  story_macro: "故事宏观规划",
  story_macro_phase: "故事宏观规划",
  book_contract: "书级创作约定",
  book_contract_phase: "书级创作约定",
  world_setup: "世界观准备",
  world_setup_phase: "世界观准备",
  character_setup: "角色阵容准备",
  character_setup_phase: "角色阵容准备",
  volume_strategy: "分卷策略",
  volume_strategy_phase: "分卷策略",
  "volume_strategy.volume_generation": "生成分卷策略",
  structured_outline: "拆章与任务单",
  structured_outline_phase: "拆章与任务单",
  "structured_outline.beat_sheet": "生成节奏板",
  "structured_outline.chapter_list": "生成章节列表",
  "structured_outline.chapter_detail_bundle": "准备章节任务单",
  "structured_outline.chapter_sync": "同步章节执行资源",
  "book.candidate.generate": "生成书级方向",
  "book.candidate.refine": "细化书级方向",
  "book.candidate.patch": "修正书级方向",
  "book.candidate.title_refine": "优化书名",
  "book.project.create": "创建小说项目",
  "workflow.takeover.execute": "接管已有项目",
  "story.macro.plan": "故事宏观规划",
  "book.contract.create": "书级创作约定",
  "character.cast.prepare": "角色阵容准备",
  "volume.strategy.plan": "分卷策略",
  "chapter.task_sheet.plan": "拆章与任务单",
  chapter_execution: "章节执行流程",
  chapter_execution_node: "章节执行流程",
  chapter_quality_review: "章节质量检查",
  chapter_quality_review_node: "章节质量检查",
  chapter_repair: "章节问题修复",
  chapter_repair_node: "章节问题修复",
  quality_repair: "章节质量修复",
  chapter_state_commit: "更新章节状态",
  chapter_state_commit_node: "更新章节状态",
  payoff_ledger_sync: "同步伏笔与读者承诺",
  payoff_ledger_sync_node: "同步伏笔与读者承诺",
  character_resource_sync: "同步角色状态",
  character_resource_sync_node: "同步角色状态",
  "chapter.draft.write": "章节正文生成",
  "planner.chapter.plan": "章节规划",
  "novel.chapter.writer": "章节正文生成",
  "audit.chapter.light": "基础质量检查",
  "audit.chapter.full": "完整质量检查",
  "novel.review.patch": "局部文本修复",
  "style.detection": "风格检查",
  "style.rewrite": "风格调整",
  "novel.payoff_ledger.sync": "伏笔与读者承诺同步",
  "novel.characterDynamics.chapterExtract": "角色动态同步",
  "novel.character_resource.extract_updates": "角色资源同步",
  "state.snapshot.extract": "章节状态同步",
  "chapter.quality.review": "章节质量检查",
  "chapter.draft.repair": "章节问题修复",
  "chapter.state.commit": "更新章节状态",
  "payoff.ledger.sync": "同步伏笔与读者承诺",
  "character.resource.sync": "同步角色状态",
  "planner.replan": "调整后续章节规划",
};

function looksLikeDirectorInternalKey(value: string): boolean {
  return /^[a-z][a-z0-9]*(?:[._:][a-z0-9]+)+$/.test(value);
}

export function getDirectorNodeDisplayLabel(input: {
  label?: string | null;
  nodeKey?: string | null;
  fallback?: string;
}): string {
  const label = input.label?.trim() ?? "";
  const nodeKey = input.nodeKey?.trim() ?? "";
  const mappedLabel = label ? DIRECTOR_NODE_DISPLAY_LABELS[label] : null;
  if (mappedLabel) {
    return mappedLabel;
  }
  const mappedNode = nodeKey ? DIRECTOR_NODE_DISPLAY_LABELS[nodeKey] : null;
  if (mappedNode) {
    return mappedNode;
  }
  if (label && !looksLikeDirectorInternalKey(label)) {
    return label;
  }
  return input.fallback ?? "AI 推进步骤";
}
