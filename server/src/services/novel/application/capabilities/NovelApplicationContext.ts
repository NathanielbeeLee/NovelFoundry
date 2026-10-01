import { NovelCoreService } from "../../NovelCoreService";
import { NovelWorldSliceService } from "../../storyWorldSlice/NovelWorldSliceService";
import { NovelWorldInstanceService } from "../../worldContext/NovelWorldInstanceService";
import { NovelWorldLibrarySaveService } from "../../worldContext/NovelWorldLibrarySaveService";
import { NovelWorldManualService } from "../../worldContext/NovelWorldManualService";
import { CharacterPreparationService } from "../../characterPrep/CharacterPreparationService";
import { CharacterDynamicsService } from "../../dynamics/CharacterDynamicsService";
import { CharacterVisibleProfileService } from "../../characterProfile/CharacterVisibleProfileService";
import { CharacterMindService } from "../../characterMind/CharacterMindService";
import { CharacterInfluenceService } from "../../characterInfluence/CharacterInfluenceService";
import { CharacterDialogueService } from "../../characterDialogue/CharacterDialogueService";
import { registerChapterExecutionStageRunner } from "../../production/ChapterExecutionStageRunner";
import { registerChapterPreparationStageRunner } from "../../production/ChapterPreparationStageRunner";
import { registerQualityRepairStageRunner } from "../../production/QualityRepairStageRunner";
import { ChapterRuntimeCoordinator } from "../../runtime/ChapterRuntimeCoordinator";
import { NovelVolumeService } from "../../volume/NovelVolumeService";
import { NovelChapterEditorService } from "../../chapterEditor/NovelChapterEditorService";
import { ChapterEditorWorkspaceService } from "../../chapterEditor/ChapterEditorWorkspaceService";

export class NovelApplicationContext {
  protected readonly core = new NovelCoreService();

  protected readonly worldSliceService = new NovelWorldSliceService();

  protected readonly novelWorldInstanceService = new NovelWorldInstanceService();

  protected readonly novelWorldManualService = new NovelWorldManualService(this.novelWorldInstanceService);

  protected readonly novelWorldLibrarySaveService = new NovelWorldLibrarySaveService(this.novelWorldInstanceService);

  protected readonly characterPreparationService = new CharacterPreparationService();

  protected readonly characterDynamicsService = new CharacterDynamicsService();

  protected readonly characterVisibleProfileService = new CharacterVisibleProfileService();

  protected readonly characterMindService = new CharacterMindService();

  protected readonly characterInfluenceService = new CharacterInfluenceService();

  protected readonly characterDialogueService = new CharacterDialogueService();

  protected readonly volumeService = new NovelVolumeService();

  protected readonly chapterEditorWorkspaceService = new ChapterEditorWorkspaceService();

  protected readonly chapterEditorService = new NovelChapterEditorService();

  protected readonly chapterRuntimeCoordinator = new ChapterRuntimeCoordinator();

  protected readonly qualityRepairCoordinator = new ChapterRuntimeCoordinator({
    resolveAuditIssues: (novelId, issueIds) => this.core.resolveAuditIssues(novelId, issueIds),
  });

  constructor() {
    registerChapterExecutionStageRunner({
      getCore: () => this.core,
      getCoordinator: () => this.chapterRuntimeCoordinator,
    });
    registerChapterPreparationStageRunner({
      getCore: () => this.core,
    });
    registerQualityRepairStageRunner({
      getCore: () => this.core,
      getCoordinator: () => this.qualityRepairCoordinator,
    });
  }
}
