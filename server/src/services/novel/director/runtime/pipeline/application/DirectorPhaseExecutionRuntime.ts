import type { CharacterCastOption, VolumePlanDocument } from "@novelfoundry/shared/types/novel";
import type { DirectorConfirmRequest } from "@novelfoundry/shared/types/novelDirector";
import type { CharacterPreparationService } from "../../../../characterPrep/CharacterPreparationService";
import { generateAutoCharacterCastDraft, persistCharacterCastOptionsDraft } from "../../../../characterPrep/characterCastGeneration";
import type { NovelContextService } from "../../../../NovelContextService";
import { type DirectorCharacterSetupPhaseResult, runDirectorCharacterSetupPhase, runDirectorStructuredOutlinePhase, runDirectorVolumeStrategyPhase } from "../../../phases/novelDirectorPipelinePhases";
import { runDirectorBookContractPhase, runDirectorStoryMacroAssetPhase } from "../../../phases/novelDirectorStoryMacroPhase";
import type { DirectorPipelineDependencies } from "./contracts";

export class DirectorPhaseExecutionRuntime {
  constructor(protected readonly deps: DirectorPipelineDependencies) {}

  async executeStoryMacroStep(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ) {
    return runDirectorStoryMacroAssetPhase({
      taskId,
      novelId,
      request: input,
      dependencies: {
        storyMacroService: this.deps.storyMacroService,
      },
      callbacks: {
        markDirectorTaskRunning: (runningTaskId, stage, itemKey, itemLabel, progress, options) => (
          this.deps.runtimeOrchestrator.markTaskRunning(runningTaskId, stage, itemKey, itemLabel, progress, {
            ...options,
            novelId,
          })
        ),
      },
    });
  }

  async executeBookContractStep(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ): Promise<void> {
    await runDirectorBookContractPhase({
      taskId,
      novelId,
      request: input,
      dependencies: {
        storyMacroService: this.deps.storyMacroService,
        bookContractService: this.deps.bookContractService,
      },
      callbacks: {
        markDirectorTaskRunning: (runningTaskId, stage, itemKey, itemLabel, progress, options) => (
          this.deps.runtimeOrchestrator.markTaskRunning(runningTaskId, stage, itemKey, itemLabel, progress, {
            ...options,
            novelId,
          })
        ),
      },
    });
  }

  async executeCharacterSetupStep(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ): Promise<DirectorCharacterSetupPhaseResult> {
    return this.runCharacterSetupPhase(taskId, novelId, input);
  }

  async executeVolumeStrategyStep(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ): Promise<VolumePlanDocument | null> {
    return this.runVolumeStrategyPhase(taskId, novelId, input);
  }

  private async findReusableDirectorCharacterCastOption(targetNovelId: string): Promise<CharacterCastOption | null> {
    const [existingOptions, existingCharacters]: [CharacterCastOption[], Awaited<ReturnType<NovelContextService["listCharacters"]>>] = await Promise.all([
      this.deps.characterPreparationService.listCharacterCastOptions(targetNovelId),
      this.deps.novelContextService.listCharacters(targetNovelId).catch(() => []),
    ]);
    const appliedOption = existingOptions.find((option) => option.status === "applied") ?? null;
    if (appliedOption) {
      return existingCharacters.length > 0
        ? appliedOption
        : { ...appliedOption, status: "draft" };
    }
    return existingOptions[0] ?? null;
  }

  private buildDirectorCharacterPreparationService() {
    return {
      generateAutoCharacterCastOption: async (targetNovelId: string, options: {
        provider?: DirectorConfirmRequest["provider"];
        model?: string;
        temperature?: number;
        storyInput?: string;
        novelId?: string;
        taskId?: string;
        stage?: string;
        itemKey?: string;
        entrypoint?: string;
      }) => {
        const reusableOption = await this.findReusableDirectorCharacterCastOption(targetNovelId);
        if (reusableOption) {
          return reusableOption;
        }
        const generated = await generateAutoCharacterCastDraft(targetNovelId, options);
        await persistCharacterCastOptionsDraft(targetNovelId, generated.storyInput, {
          options: [generated.parsed.option],
        });
        const [persistedOption] = await this.deps.characterPreparationService.listCharacterCastOptions(targetNovelId);
        if (!persistedOption) {
          throw new Error("Auto director character cast option was not persisted.");
        }
        return persistedOption;
      },
      assessCharacterCastOptions: (...args: Parameters<CharacterPreparationService["assessCharacterCastOptions"]>) => (
        this.deps.characterPreparationService.assessCharacterCastOptions(...args)
      ),
      applyCharacterCastOption: (...args: Parameters<CharacterPreparationService["applyCharacterCastOption"]>) => (
        this.deps.characterPreparationService.applyCharacterCastOption(...args)
      ),
      findReusableCharacterCastOption: (targetNovelId: string) => this.findReusableDirectorCharacterCastOption(targetNovelId),
    };
  }

  private async runCharacterSetupPhase(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ): Promise<DirectorCharacterSetupPhaseResult> {
    return runDirectorCharacterSetupPhase({
      taskId,
      novelId,
      request: input,
      dependencies: {
        workflowService: this.deps.workflowService,
        novelContextService: this.deps.novelContextService,
        characterDynamicsService: this.deps.characterDynamicsService,
        characterPreparationService: this.buildDirectorCharacterPreparationService(),
        volumeService: this.deps.volumeService,
      },
      callbacks: {
        buildDirectorSeedPayload: (request, takeoverNovelId, extra) => this.deps.buildDirectorSeedPayload(request, takeoverNovelId, extra),
        markDirectorTaskRunning: (runningTaskId, stage, itemKey, itemLabel, progress, options) => (
          this.deps.runtimeOrchestrator.markTaskRunning(runningTaskId, stage, itemKey, itemLabel, progress, {
            ...options,
            novelId,
          })
        ),
      },
    });
  }

  private async runVolumeStrategyPhase(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ): Promise<VolumePlanDocument | null> {
    return runDirectorVolumeStrategyPhase({
      taskId,
      novelId,
      request: input,
      dependencies: {
        workflowService: this.deps.workflowService,
        novelContextService: this.deps.novelContextService,
        characterDynamicsService: this.deps.characterDynamicsService,
        characterPreparationService: this.buildDirectorCharacterPreparationService(),
        volumeService: this.deps.volumeService,
      },
      callbacks: {
        buildDirectorSeedPayload: (request, takeoverNovelId, extra) => this.deps.buildDirectorSeedPayload(request, takeoverNovelId, extra),
        markDirectorTaskRunning: (runningTaskId, stage, itemKey, itemLabel, progress, options) => (
          this.deps.runtimeOrchestrator.markTaskRunning(runningTaskId, stage, itemKey, itemLabel, progress, {
            ...options,
            novelId,
          })
        ),
      },
    });
  }

  async executeStructuredOutlineStep(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
    baseWorkspace: VolumePlanDocument,
  ): Promise<void> {
    await runDirectorStructuredOutlinePhase({
      taskId,
      novelId,
      request: input,
      baseWorkspace,
      dependencies: {
        workflowService: this.deps.workflowService,
        novelContextService: this.deps.novelContextService,
        characterDynamicsService: this.deps.characterDynamicsService,
        characterPreparationService: this.buildDirectorCharacterPreparationService(),
        volumeService: this.deps.volumeService,
      },
      callbacks: {
        buildDirectorSeedPayload: (request, takeoverNovelId, extra) => this.deps.buildDirectorSeedPayload(request, takeoverNovelId, extra),
        markDirectorTaskRunning: (runningTaskId, stage, itemKey, itemLabel, progress, options) => (
          this.deps.runtimeOrchestrator.markTaskRunning(runningTaskId, stage, itemKey, itemLabel, progress, {
            ...options,
            novelId,
          })
        ),
      },
    });
  }

  private async runStoryMacroPhase(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ) {
    return this.executeStoryMacroStep(taskId, novelId, input);
  }

  private async runBookContractPhase(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
  ): Promise<void> {
    await this.executeBookContractStep(taskId, novelId, input);
  }

  private async runStructuredOutlinePhase(
    taskId: string,
    novelId: string,
    input: DirectorConfirmRequest,
    baseWorkspace: VolumePlanDocument,
  ): Promise<void> {
    await this.executeStructuredOutlineStep(taskId, novelId, input, baseWorkspace);
  }
}
