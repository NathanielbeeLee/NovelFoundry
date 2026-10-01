import { NovelCoreService } from "../../NovelCoreService";
import { buildManualChapterControlPolicy } from "../../production/ChapterExecutionStageRunner";
import { buildManualProductionControlPolicy } from "../../production/ChapterExecutionStageRunner";
import { novelProductionOrchestrator } from "../../production/NovelProductionOrchestrator";
import { ChapterRuntimeCoordinator } from "../../runtime/ChapterRuntimeCoordinator";
import { NovelProjectApplication } from "./NovelProjectApplication";

export class NovelProductionApplication extends NovelProjectApplication {
  createOutlineStream(...args: Parameters<NovelCoreService["createOutlineStream"]>) {
    return this.core.createOutlineStream(...args);
  }

  async createStructuredOutlineStream(...args: Parameters<NovelCoreService["createStructuredOutlineStream"]>) {
    const [novelId] = args;
    await this.core.createNovelSnapshot(novelId, "manual", `before-structured-outline-${Date.now()}`);
    return this.core.createStructuredOutlineStream(...args);
  }

  async createChapterStream(...args: Parameters<NovelCoreService["createChapterStream"]>) {
    const [novelId, chapterId, options] = args;
    const result = await novelProductionOrchestrator.runStage({
      novelId,
      stage: "chapter_execution",
      policy: buildManualChapterControlPolicy(),
      trigger: "manual_generate_chapter",
      payload: {
        mode: "single_chapter_stream",
        chapterId,
        options,
        includeRuntimePackage: true,
      },
    });
    if (!result.payload) {
      throw new Error("Unified chapter execution did not return a stream payload.");
    }
    return result.payload as Awaited<ReturnType<ChapterRuntimeCoordinator["createChapterStream"]>>;
  }

  createChapterRuntimeStream(...args: Parameters<NovelCoreService["createChapterStream"]>) {
    return this.createChapterStream(...args);
  }

  generateTitles(...args: Parameters<NovelCoreService["generateTitles"]>) {
    return this.core.generateTitles(...args);
  }

  createBibleStream(...args: Parameters<NovelCoreService["createBibleStream"]>) {
    return this.core.createBibleStream(...args);
  }

  createBeatStream(...args: Parameters<NovelCoreService["createBeatStream"]>) {
    return this.core.createBeatStream(...args);
  }

  generateChapterHook(...args: Parameters<NovelCoreService["generateChapterHook"]>) {
    return this.core.generateChapterHook(...args);
  }

  reviewChapter(...args: Parameters<NovelCoreService["reviewChapter"]>) {
    return this.core.reviewChapter(...args);
  }

  async createRepairStream(...args: Parameters<NovelCoreService["createRepairStream"]>) {
    const [novelId, chapterId, options] = args;
    const result = await novelProductionOrchestrator.runStage({
      novelId,
      stage: "quality_repair",
      policy: buildManualProductionControlPolicy(),
      trigger: "manual_repair_chapter",
      payload: {
        mode: "repair_chapter_stream",
        chapterId,
        options,
      },
    });
    if (!result.payload) {
      throw new Error("Unified quality repair stage did not return a repair stream payload.");
    }
    return result.payload as Awaited<ReturnType<ChapterRuntimeCoordinator["createRepairStream"]>>;
  }

  getQualityReport(...args: Parameters<NovelCoreService["getQualityReport"]>) {
    return this.core.getQualityReport(...args);
  }

  async startPipelineJob(...args: Parameters<NovelCoreService["startPipelineJob"]>) {
    const [novelId] = args;
    await this.createNovelSnapshot(novelId, "before_pipeline", `before-pipeline-${Date.now()}`);
    return this.core.startPipelineJob(...args);
  }

  getPipelineJob(...args: Parameters<NovelCoreService["getPipelineJob"]>) {
    return this.core.getPipelineJob(...args);
  }

  getPipelineJobById(...args: Parameters<NovelCoreService["getPipelineJobById"]>) {
    return this.core.getPipelineJobById(...args);
  }

  findActivePipelineJobForRange(...args: Parameters<NovelCoreService["findActivePipelineJobForRange"]>) {
    return this.core.findActivePipelineJobForRange(...args);
  }

  resumePipelineJob(...args: Parameters<NovelCoreService["resumePipelineJob"]>) {
    return this.core.resumePipelineJob(...args);
  }

  retryPipelineJob(...args: Parameters<NovelCoreService["retryPipelineJob"]>) {
    return this.core.retryPipelineJob(...args);
  }

  cancelPipelineJob(...args: Parameters<NovelCoreService["cancelPipelineJob"]>) {
    return this.core.cancelPipelineJob(...args);
  }
}
