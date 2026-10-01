import { NovelCoreService } from "../../NovelCoreService";
import { buildManualProductionControlPolicy } from "../../production/ChapterExecutionStageRunner";
import { novelProductionOrchestrator } from "../../production/NovelProductionOrchestrator";
import { NovelVolumeService } from "../../volume/NovelVolumeService";
import { NovelChapterEditorService } from "../../chapterEditor/NovelChapterEditorService";
import { ChapterEditorWorkspaceService } from "../../chapterEditor/ChapterEditorWorkspaceService";
import { NovelApplicationContext } from "./NovelApplicationContext";

export class NovelPlanningApplication extends NovelApplicationContext {
  getVolumes(...args: Parameters<NovelVolumeService["getVolumes"]>) {
    return this.volumeService.getVolumes(...args);
  }

  updateVolumes(...args: Parameters<NovelVolumeService["updateVolumes"]>) {
    return this.volumeService.updateVolumes(...args);
  }

  generateVolumes(...args: Parameters<NovelVolumeService["generateVolumes"]>) {
    return this.volumeService.generateVolumes(...args);
  }

  listVolumeVersions(...args: Parameters<NovelVolumeService["listVolumeVersions"]>) {
    return this.volumeService.listVolumeVersions(...args);
  }

  getVolumeVersion(...args: Parameters<NovelVolumeService["getVolumeVersion"]>) {
    return this.volumeService.getVolumeVersion(...args);
  }

  createVolumeDraft(...args: Parameters<NovelVolumeService["createVolumeDraft"]>) {
    return this.volumeService.createVolumeDraft(...args);
  }

  activateVolumeVersion(...args: Parameters<NovelVolumeService["activateVolumeVersion"]>) {
    return this.volumeService.activateVolumeVersion(...args);
  }

  freezeVolumeVersion(...args: Parameters<NovelVolumeService["freezeVolumeVersion"]>) {
    return this.volumeService.freezeVolumeVersion(...args);
  }

  getVolumeDiff(...args: Parameters<NovelVolumeService["getVolumeDiff"]>) {
    return this.volumeService.getVolumeDiff(...args);
  }

  analyzeVolumeImpact(...args: Parameters<NovelVolumeService["analyzeVolumeImpact"]>) {
    return this.volumeService.analyzeVolumeImpact(...args);
  }

  syncVolumeChapters(...args: Parameters<NovelVolumeService["syncVolumeChapters"]>) {
    return this.volumeService.syncVolumeChapters(...args);
  }

  ensureChapterExecutionContract(...args: Parameters<NovelVolumeService["ensureChapterExecutionContract"]>) {
    return this.volumeService.ensureChapterExecutionContract(...args);
  }

  migrateLegacyVolumes(...args: Parameters<NovelVolumeService["migrateLegacyVolumes"]>) {
    return this.volumeService.migrateLegacyVolumes(...args);
  }

  async listStorylineVersions(...args: Parameters<NovelCoreService["listStorylineVersions"]>) {
    const rows = await this.volumeService.listStorylineVersionsCompat(...args);
    return rows.map((row) => ({
      ...row,
      diffSummary: row.diffSummary ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }));
  }

  async createStorylineDraft(...args: Parameters<NovelCoreService["createStorylineDraft"]>) {
    const row = await this.volumeService.createStorylineDraftCompat(...args);
    return {
      ...row,
      diffSummary: row.diffSummary ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async activateStorylineVersion(...args: Parameters<NovelCoreService["activateStorylineVersion"]>) {
    const row = await this.volumeService.activateStorylineVersionCompat(...args);
    return {
      ...row,
      diffSummary: row.diffSummary ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async freezeStorylineVersion(...args: Parameters<NovelCoreService["freezeStorylineVersion"]>) {
    const row = await this.volumeService.freezeStorylineVersionCompat(...args);
    return {
      ...row,
      diffSummary: row.diffSummary ?? null,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }

  async getStorylineDiff(...args: Parameters<NovelCoreService["getStorylineDiff"]>) {
    const diff = await this.volumeService.getStorylineDiffCompat(...args);
    return {
      ...diff,
      diffSummary: diff.diffSummary ?? "",
    };
  }

  analyzeStorylineImpact(...args: Parameters<NovelCoreService["analyzeStorylineImpact"]>) {
    return this.volumeService.analyzeStorylineImpactCompat(...args);
  }

  previewChapterRewrite(...args: Parameters<NovelChapterEditorService["previewRewrite"]>) {
    return this.chapterEditorService.previewRewrite(...args);
  }

  previewChapterAiRevision(...args: Parameters<NovelChapterEditorService["previewAiRevision"]>) {
    return this.chapterEditorService.previewAiRevision(...args);
  }

  getChapterEditorWorkspace(...args: Parameters<ChapterEditorWorkspaceService["getWorkspace"]>) {
    return this.chapterEditorWorkspaceService.getWorkspace(...args);
  }

  getNovelState(...args: Parameters<NovelCoreService["getNovelState"]>) {
    return this.core.getNovelState(...args);
  }

  getLatestStateSnapshot(...args: Parameters<NovelCoreService["getLatestStateSnapshot"]>) {
    return this.core.getLatestStateSnapshot(...args);
  }

  getChapterStateSnapshot(...args: Parameters<NovelCoreService["getChapterStateSnapshot"]>) {
    return this.core.getChapterStateSnapshot(...args);
  }

  rebuildNovelState(...args: Parameters<NovelCoreService["rebuildNovelState"]>) {
    return this.core.rebuildNovelState(...args);
  }

  generateBookPlan(...args: Parameters<NovelCoreService["generateBookPlan"]>) {
    return this.core.generateBookPlan(...args);
  }

  generateArcPlan(...args: Parameters<NovelCoreService["generateArcPlan"]>) {
    return this.core.generateArcPlan(...args);
  }

  async generateChapterPlan(...args: Parameters<NovelCoreService["generateChapterPlan"]>) {
    const [novelId, chapterId, options] = args;
    const result = await novelProductionOrchestrator.runStage({
      novelId,
      stage: "chapter_preparation",
      policy: buildManualProductionControlPolicy(),
      trigger: "manual_generate_chapter_plan",
      payload: {
        mode: "generate_chapter_plan",
        chapterId,
        options,
      },
    });
    if (!result.payload) {
      throw new Error("Unified chapter preparation did not return a chapter plan payload.");
    }
    return result.payload as Awaited<ReturnType<NovelCoreService["generateChapterPlan"]>>;
  }

  getChapterPlan(...args: Parameters<NovelCoreService["getChapterPlan"]>) {
    return this.core.getChapterPlan(...args);
  }

  async replanNovel(...args: Parameters<NovelCoreService["replanNovel"]>) {
    const [novelId, input] = args;
    const result = await novelProductionOrchestrator.runStage({
      novelId,
      stage: "quality_repair",
      policy: buildManualProductionControlPolicy(),
      trigger: "manual_replan_novel",
      payload: {
        mode: "replan_novel",
        input,
      },
    });
    if (!result.payload) {
      throw new Error("Unified quality repair stage did not return a replan payload.");
    }
    return result.payload as Awaited<ReturnType<NovelCoreService["replanNovel"]>>;
  }

  auditChapter(...args: Parameters<NovelCoreService["auditChapter"]>) {
    return this.core.auditChapter(...args);
  }

  listChapterAuditReports(...args: Parameters<NovelCoreService["listChapterAuditReports"]>) {
    return this.core.listChapterAuditReports(...args);
  }

  resolveAuditIssues(...args: Parameters<NovelCoreService["resolveAuditIssues"]>) {
    return this.core.resolveAuditIssues(...args);
  }

  getPayoffLedger(...args: Parameters<NovelCoreService["getPayoffLedger"]>) {
    return this.core.getPayoffLedger(...args);
  }
}
