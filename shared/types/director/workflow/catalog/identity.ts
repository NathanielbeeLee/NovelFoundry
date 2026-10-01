import type { WorkflowStepCatalogDisplayStage } from "./contracts.js";

export const WORKFLOW_DISPLAY_STAGES: readonly {
  key: WorkflowStepCatalogDisplayStage;
  label: string;
}[] = [
  { key: "project_setup", label: "项目设定" },
  { key: "story_planning", label: "故事宏观规划" },
  { key: "world_setup", label: "世界观准备" },
  { key: "character_setup", label: "角色准备" },
  { key: "volume_strategy", label: "卷战略" },
  { key: "structured_outline", label: "节奏 / 拆章" },
  { key: "chapter_execution", label: "章节执行" },
  { key: "quality_repair", label: "质量修复" },
] as const;

export const DIRECTOR_WORKFLOW_STEP_IDS = {
  candidate: {
    candidate_generation: "book.candidate.generate",
    candidate_refine: "book.candidate.refine",
    candidate_patch: "book.candidate.patch",
    candidate_title_refine: "book.candidate.title_refine",
  },
  planning: {
    story_macro: "story.macro.plan",
    book_contract: "book.contract.create",
    world_setup: "book.world.prepare",
    character_setup: "character.cast.prepare",
    volume_strategy: "volume.strategy.plan",
    structured_outline: "volume.beat_sheet.generate",
  },
  structuredOutline: {
    beat_sheet: "volume.beat_sheet.generate",
    chapter_list: "volume.chapter_list.generate",
    chapter_detail_bundle: "volume.chapter_detail_bundle.generate",
  },
  executionContractSync: "chapter.execution_contract.sync",
  execution: {
    chapter_execution: "chapter.draft.write",
    chapter_quality_review: "chapter.quality.review",
    chapter_repair: "chapter.draft.repair",
    chapter_state_commit: "chapter.state.commit",
    payoff_ledger_sync: "payoff.ledger.sync",
    character_resource_sync: "character.resource.sync",
    quality_repair: "chapter.quality.repair",
  },
  takeover: "workflow.takeover.execute",
  confirmNovelCreate: "book.project.create",
} as const;
