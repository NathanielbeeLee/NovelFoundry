import type { VolumePlanDocument } from "@novelfoundry/shared/types/novel";
import type { DirectorConfirmRequest } from "@novelfoundry/shared/types/novelDirector";
import { isDirectorAutoExecutionRunMode, isFullBookAutopilotRunMode } from "@novelfoundry/shared/types/novelDirector";
import { normalizeDirectorAutoApprovalConfig, shouldAutoApproveDirectorApprovalPoint, shouldAutoApproveDirectorCheckpoint, type DirectorAutoApprovalPointCode } from "@novelfoundry/shared/types/autoDirectorApproval";
import { recordAutoDirectorAutoApprovalFromTask } from "../../../../../task/autoDirectorFollowUps/autoDirectorAutoApprovalAudit";
import { normalizeDirectorMemoryScope } from "../../autoDirectorMemorySafety";
import { normalizeDirectorRunMode } from "../../novelDirectorHelpers";
import { resolveSafeDirectorPipelineStartPhase } from "../../../recovery/novelDirectorRecovery";
import { getDirectorPlanningStepModule, getDirectorExecutionContractSyncStepModule, getDirectorStructuredOutlineStepModules } from "../../../workflowStepRuntime/directorWorkflowStepModules";
import { inspectWorkflowStepFacts, isExecutableWorkflowStepModule, type WorkflowStepModuleDescriptor } from "../../../workflowStepRuntime/WorkflowStepModule";
import type { DirectorPipelinePhase } from "../../../recovery/novelDirectorRecovery";
import { WorldContextGateway } from "../../../../worldContext/WorldContextGateway";
import type { NovelWorkflowStage } from "@novelfoundry/shared/types/novelWorkflow";
import type { DirectorPipelineRunInput } from "./contracts";
import { DirectorPhaseExecutionRuntime } from "./DirectorPhaseExecutionRuntime";
import { isDirectorCharacterSetupPauseResult } from "../domain/phaseResult";

export class NovelDirectorPipelineRuntime extends DirectorPhaseExecutionRuntime {
  async runPipeline(input: DirectorPipelineRunInput): Promise<void> {
    const safeStartPhase = await this.resolveSafePipelineStartPhase({
      novelId: input.novelId,
      requestedPhase: input.startPhase,
      request: input.input,
    });
    const sequence: DirectorPipelinePhase[] = [
      "story_macro",
      "book_contract",
      "world_setup",
      "character_setup",
      "volume_strategy",
      "structured_outline",
    ];
    const startIndex = Math.max(0, sequence.indexOf(safeStartPhase));
    const approval = this.resolveRuntimeApproval(input);
    const bookContractApproval = approval;
    for (const phase of sequence.slice(startIndex)) {
      if (phase === "story_macro") {
        const storyMacroModule = getDirectorPlanningStepModule("story_macro");
        if (!(await this.isModuleFactCompleted(storyMacroModule, input))) {
          await this.deps.runtimeOrchestrator.runStepModule({
            module: storyMacroModule,
            taskId: input.taskId,
            novelId: input.novelId,
            targetId: input.novelId,
            approveCurrentGate: approval.approveCurrentGate,
            approveAutoExecutionScope: approval.approveAutoExecutionScope,
          });
          if (this.isStageReview(input)) {
            await this.pauseForStepReview(input, storyMacroModule);
            return;
          }
        }
        continue;
      }

      if (phase === "book_contract") {
        const bookContractModule = getDirectorPlanningStepModule("book_contract");
        if (!(await this.isModuleFactCompleted(bookContractModule, input))) {
          await this.deps.runtimeOrchestrator.runStepModule({
            module: bookContractModule,
            taskId: input.taskId,
            novelId: input.novelId,
            targetId: input.novelId,
            approveCurrentGate: bookContractApproval.approveCurrentGate,
            approveAutoExecutionScope: bookContractApproval.approveAutoExecutionScope,
          });
          if (this.isStageReview(input)) {
            await this.pauseForStepReview(input, bookContractModule);
            return;
          }
        }
        continue;
      }

      if (phase === "world_setup") {
        if (input.input.worldSetupMode === "skip") {
          continue;
        }
        const module = getDirectorPlanningStepModule("world_setup");
        if (!(await this.isModuleFactCompleted(module, input))) {
          await this.deps.runtimeOrchestrator.runStepModule({
            module,
            taskId: input.taskId,
            novelId: input.novelId,
            targetId: input.novelId,
            approveCurrentGate: approval.approveCurrentGate,
            approveAutoExecutionScope: approval.approveAutoExecutionScope,
          });
          if (this.isStageReview(input)) {
            await this.pauseForStepReview(input, module);
            return;
          }
        }
        continue;
      }

      if (phase === "character_setup") {
        const module = getDirectorPlanningStepModule("character_setup");
        if (await this.isModuleFactCompleted(module, input)) {
          continue;
        }
        const result = await this.deps.runtimeOrchestrator.runStepModule({
          module,
          taskId: input.taskId,
          novelId: input.novelId,
          targetId: input.novelId,
          approveCurrentGate: approval.approveCurrentGate,
          approveAutoExecutionScope: approval.approveAutoExecutionScope,
        });
        if (isDirectorCharacterSetupPauseResult(result)) {
          return;
        }
        if (this.isStageReview(input)) {
          await this.pauseForStepReview(input, module);
          return;
        }
        continue;
      }

      if (phase === "volume_strategy") {
        const module = getDirectorPlanningStepModule("volume_strategy");
        if (await this.isModuleFactCompleted(module, input)) {
          continue;
        }
        const volumeApproval = this.resolveRuntimeApproval(input, "volume_strategy_ready");
        const paused = await this.deps.runtimeOrchestrator.runStepModule({
          module,
          taskId: input.taskId,
          novelId: input.novelId,
          targetId: input.novelId,
          approveCurrentGate: volumeApproval.approveCurrentGate,
          approveAutoExecutionScope: volumeApproval.approveAutoExecutionScope,
        });
        if (paused === null) {
          return;
        }
        if (this.isStageReview(input)) {
          await this.pauseForStepReview(input, module);
          return;
        }
        continue;
      }

      const currentWorkspace = await this.loadVolumeWorkspaceForOutline(input.novelId);
      if (!currentWorkspace) {
        return;
      }
      if (await this.runStructuredOutlineNode(input, currentWorkspace)) {
        return;
      }
      const executionContractSyncModule = getDirectorExecutionContractSyncStepModule();
      const structuredApproval = this.resolveRuntimeApproval(input, "structured_outline_ready");
      if (!(await this.isModuleFactCompleted(executionContractSyncModule, input))) {
        await this.deps.runtimeOrchestrator.runStepModule({
          module: executionContractSyncModule,
          taskId: input.taskId,
          novelId: input.novelId,
          targetId: input.novelId,
          approveCurrentGate: structuredApproval.approveCurrentGate,
          approveAutoExecutionScope: structuredApproval.approveAutoExecutionScope,
        });
        if (this.isStageReview(input)) {
          await this.pauseForStepReview(input, executionContractSyncModule);
          return;
        }
      }
      await this.maybeRunAutoApprovedChapters(input);
      return;
    }
  }

  async runStructuredOutlineNode(
    input: DirectorPipelineRunInput,
    workspace: VolumePlanDocument,
  ): Promise<boolean> {
    await this.assertOutlineStartAllowed(input, workspace);
    const approval = this.resolveRuntimeApproval(input, "structured_outline_ready");
    for (const module of getDirectorStructuredOutlineStepModules()) {
      if (module.id === "chapter.execution_contract.sync") {
        continue;
      }
      if (this.isStageReview(input) && await this.isModuleFactCompleted(module, input)) {
        continue;
      }
      await this.deps.runtimeOrchestrator.runStepModule({
        module,
        taskId: input.taskId,
        novelId: input.novelId,
        targetId: input.novelId,
        approveCurrentGate: approval.approveCurrentGate,
        approveAutoExecutionScope: approval.approveAutoExecutionScope,
      });
      if (this.isStageReview(input)) {
        await this.pauseForStepReview(input, module, workspace.volumes[0]?.id ?? null);
        return true;
      }
    }
    return false;
  }

  private isStageReview(input: Pick<DirectorPipelineRunInput, "input">): boolean {
    return normalizeDirectorRunMode(input.input.runMode) === "stage_review";
  }

  private async pauseForStepReview(
    input: DirectorPipelineRunInput,
    module: WorkflowStepModuleDescriptor,
    targetId: string | null = input.novelId,
  ): Promise<void> {
    const stage = this.resolveWorkflowStage(module);
    const progress = module.defaultWaitingState?.progress ?? 0.5;
    await this.deps.workflowService.markTaskWaitingApproval(input.taskId, {
      stage,
      itemKey: module.defaultWaitingState?.itemKey ?? module.id,
      itemLabel: `${module.label}已完成，请检查后继续`,
      progress,
      checkpointType: "step_review_required",
      checkpointSummary: `${module.label}已生成。你可以检查、AI 完善或重新生成当前步骤，确认后再继续下一步。`,
      seedPayload: this.deps.buildDirectorSeedPayload(input.input, input.novelId, {
        directorSession: {
          runMode: "stage_review",
          phase: stage === "structured_outline"
            ? "structured_outline"
            : stage === "character_setup"
              ? "character_setup"
              : stage === "world_setup"
                ? "world_setup"
              : stage === "volume_strategy"
                ? "volume_strategy"
                : "story_macro",
          isBackgroundRunning: false,
        },
        stepReview: {
          stepId: module.id,
          nodeKey: module.nodeKey,
          label: module.label,
          targetType: module.targetType,
          targetId,
          completedAt: new Date().toISOString(),
        },
      }),
    });
  }

  private resolveWorkflowStage(module: WorkflowStepModuleDescriptor): NovelWorkflowStage {
    const stage = module.defaultWaitingState?.stage ?? module.stage;
    switch (stage) {
      case "story_macro":
      case "world_setup":
      case "character_setup":
      case "volume_strategy":
      case "structured_outline":
      case "chapter_execution":
      case "quality_repair":
      case "project_setup":
      case "auto_director":
        return stage;
      default:
        return "auto_director";
    }
  }

  private async isModuleFactCompleted(
    module: WorkflowStepModuleDescriptor,
    input: Pick<DirectorPipelineRunInput, "taskId" | "novelId">,
  ): Promise<boolean> {
    if (!isExecutableWorkflowStepModule(module)) {
      return false;
    }
    const facts = await inspectWorkflowStepFacts(module, {
      taskId: input.taskId,
      novelId: input.novelId,
    });
    return facts.completed;
  }

  private async assertOutlineStartAllowed(
    input: DirectorPipelineRunInput,
    workspace: VolumePlanDocument,
  ): Promise<void> {
    await this.deps.assertHighMemoryStartAllowed({
      taskId: input.taskId,
      novelId: input.novelId,
      stage: "structured_outline",
      itemKey: "chapter_list",
      volumeId: workspace.volumes[0]?.id,
      scope: normalizeDirectorMemoryScope({
        volumeId: workspace.volumes[0]?.id,
        fallback: input.scope ?? "book",
      }),
      batchAlreadyStartedCount: input.batchAlreadyStartedCount,
    });
  }

  async loadVolumeWorkspaceForOutline(novelId: string): Promise<VolumePlanDocument | null> {
    const workspace = await this.deps.volumeService.getVolumes(novelId).catch(() => null);
    if (!workspace?.volumes.length || !workspace.strategyPlan) {
      return null;
    }
    return workspace;
  }

  private async maybeRunAutoApprovedChapters(input: DirectorPipelineRunInput): Promise<void> {
    const shouldAutoApproveCheckpoint = this.shouldAutoApproveCheckpoint(input.input, "chapter_batch_ready");
    if (!input.approveAutoExecutionScope && !shouldAutoApproveCheckpoint) {
      return;
    }
    if (shouldAutoApproveCheckpoint) {
      await recordAutoDirectorAutoApprovalFromTask({
        taskId: input.taskId,
        checkpointType: "chapter_batch_ready",
      });
    }
    const approval = this.resolveRuntimeApproval(input, "structured_outline_ready");
    await this.deps.runtimeOrchestrator.runChapterExecutionNode({
      taskId: input.taskId,
      novelId: input.novelId,
      request: input.input,
      resumeCheckpointType: "chapter_batch_ready",
      approveCurrentGate: approval.approveCurrentGate,
      approveAutoExecutionScope: approval.approveAutoExecutionScope,
    });
  }

  private async resolveSafePipelineStartPhase(input: {
    novelId: string;
    requestedPhase: Exclude<DirectorPipelinePhase, "book_contract">;
    request: DirectorConfirmRequest;
  }): Promise<DirectorPipelinePhase> {
    const [workspace, storyMacroPlan, bookContract, characters, hasActiveWorld] = await Promise.all([
      this.deps.volumeService.getVolumes(input.novelId).catch(() => null),
      this.deps.storyMacroService.getPlan(input.novelId).catch(() => null),
      this.deps.bookContractService.getByNovelId(input.novelId).catch(() => null),
      this.deps.novelContextService.listCharacters(input.novelId).catch(() => []),
      new WorldContextGateway().hasActiveWorld(input.novelId).catch(() => false),
    ]);
    return resolveSafeDirectorPipelineStartPhase({
      requestedPhase: input.requestedPhase,
      hasStoryMacroPlan: Boolean(
        storyMacroPlan
        && typeof storyMacroPlan.storyInput === "string"
        && storyMacroPlan.storyInput.trim()
        && storyMacroPlan.decomposition,
      ),
      hasBookContract: Boolean(bookContract),
      hasWorldSetupPrepared: input.request.worldSetupMode === "skip" || hasActiveWorld,
      hasCharacters: characters.length > 0,
      hasVolumeWorkspace: Boolean(workspace?.volumes.length),
      hasVolumeStrategyPlan: Boolean(workspace?.strategyPlan),
    });
  }

  private shouldAutoApproveCheckpoint(
    input: DirectorConfirmRequest,
    checkpointType: "chapter_batch_ready" | "replan_required",
  ): boolean {
    if (Object.prototype.hasOwnProperty.call(input, "autoApproval")) {
      return shouldAutoApproveDirectorCheckpoint(
        normalizeDirectorAutoApprovalConfig(input.autoApproval),
        checkpointType,
      );
    }
    return checkpointType === "chapter_batch_ready" && isDirectorAutoExecutionRunMode(normalizeDirectorRunMode(input.runMode));
  }

  private resolveRuntimeApproval(
    input: DirectorPipelineRunInput,
    approvalPointCode?: DirectorAutoApprovalPointCode,
  ): {
    approveCurrentGate: boolean;
    approveAutoExecutionScope: boolean;
  } {
    const runMode = normalizeDirectorRunMode(input.input.runMode);
    const isFullBookAutopilot = isFullBookAutopilotRunMode(runMode);
    const isAuthorizedAutoToExecutionGate = runMode === "auto_to_execution"
      && Boolean(approvalPointCode)
      && shouldAutoApproveDirectorApprovalPoint(
        normalizeDirectorAutoApprovalConfig(input.input.autoApproval),
        approvalPointCode as DirectorAutoApprovalPointCode,
      );
    const isPreparationHandoffGate = runMode === "auto_to_ready"
      && Boolean(approvalPointCode);
    return {
      approveCurrentGate: Boolean(
        input.approveCurrentGate
        || isFullBookAutopilot
        || isAuthorizedAutoToExecutionGate
        || isPreparationHandoffGate
      ),
      approveAutoExecutionScope: Boolean(
        input.approveAutoExecutionScope
        || isFullBookAutopilot
        || isAuthorizedAutoToExecutionGate
        || isPreparationHandoffGate
      ),
    };
  }
}
