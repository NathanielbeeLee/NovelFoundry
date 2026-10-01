import NovelEditView from "../../components/NovelEditView";
import NovelProductionExperienceHandoff from "../../components/NovelProductionExperienceHandoff";
import NovelExistingProjectTakeoverDialog from "../../components/NovelExistingProjectTakeoverDialog";
import { canCancelDirectorTask } from "@/lib/novelWorkflowTaskUi";
import { resolveTakeoverDialogContextTaskId } from "../../novelEditAutomationStatus";
import type { useNovelEditWorkspaceState } from "../hooks/useNovelEditWorkspaceState";
import type { useNovelEditDirectorProjection } from "../hooks/director/useNovelEditDirectorProjection";
import type { useNovelEditWorkspaceData } from "../hooks/useNovelEditWorkspaceData";
import type { useNovelEditExport } from "../hooks/useNovelEditExport";
import type { useNovelEditDirectorTakeover } from "../hooks/director/useNovelEditDirectorTakeover";
import type { useNovelEditDirectorCommands } from "../hooks/director/useNovelEditDirectorCommands";
import type { useNovelEditProductionRuntime } from "../hooks/production/useNovelEditProductionRuntime";
import type { useNovelEditVolumeWorkspace } from "../hooks/useNovelEditVolumeWorkspace";
import type { useNovelEditVolumeVersions } from "../hooks/useNovelEditVolumeVersions";
import { buildNovelEditWorkspacePlanningTabs } from "./planning/buildNovelEditWorkspacePlanningTabs";
import { buildNovelEditWorkspaceProductionTabs } from "./production/buildNovelEditWorkspaceProductionTabs";

interface NovelEditWorkspaceViewInput {
  state: ReturnType<typeof useNovelEditWorkspaceState>;
  director: ReturnType<typeof useNovelEditDirectorProjection>;
  data: ReturnType<typeof useNovelEditWorkspaceData>;
  exporting: ReturnType<typeof useNovelEditExport>;
  takeover: ReturnType<typeof useNovelEditDirectorTakeover>;
  commands: ReturnType<typeof useNovelEditDirectorCommands>;
  production: ReturnType<typeof useNovelEditProductionRuntime>;
  volumes: ReturnType<typeof useNovelEditVolumeWorkspace>;
  versions: ReturnType<typeof useNovelEditVolumeVersions>;
}

export function NovelEditWorkspaceView({
  state,
  director,
  data,
  exporting,
  takeover: takeoverState,
  commands,
  production,
  volumes,
  versions,
}: NovelEditWorkspaceViewInput) {
  const {
    directorTaskId,
    id,
    basicForm,
    activeTab,
    setActiveTab,
    isTaskDrawerOpen,
    setIsTaskDrawerOpen,
    taskPanelOpen,
    clearTaskPanelOpen,
    llm,
    retryOverride,
    setRetryOverride,
    setSelectedChapterId,
  } = state;
  const {
    activeAutoDirectorTask,
    bookAutomationProjection,
    displayAutoDirectorTask,
    workflowCurrentTab,
    isTakeoverDismissed,
    activeDirectorSnapshot,
    activeDirectorRuntimeSnapshot,
    activeAutoDirectorFollowUp,
    activeDirectorRuntimeHardBlocked,
    activeDirectorRuntimeBlockedReason,
  } = director;
  const {
    genreOptions,
    storyModeOptions,
    worldListQuery,
    storyMacroTab,
    pendingCharacterResourceProposals,
  } = data;
  const {
    currentExportScope,
    isExportingCurrentMarkdown,
    isExportingCurrentJson,
    isExportingFullMarkdown,
    isExportingFullJson,
    exportNovelMutation,
    exportNovelTitle,
  } = exporting;
  const { takeover, taskDrawerActions } = takeoverState;
  const {
    handleTaskDrawerProjectionAction,
    handleDrawerFollowUpAction,
    executeFollowUpActionMutation,
    retryAutoDirectorWithCurrentModelMutation,
    retryAutoDirectorWithTaskModelMutation,
    openAutoDirectorTaskCenter,
  } = commands;
  const { confirmCharacterResourceProposalMutation, rejectCharacterResourceProposalMutation } = production;
  const {
    basicTab,
    outlineTab,
    structuredTab,
  } = buildNovelEditWorkspacePlanningTabs({ state, data, production, volumes, versions });
  const {
    chapterTab,
    pipelineTab,
    characterTab,
  } = buildNovelEditWorkspaceProductionTabs({ state, data, production, director });
  const renderTakeoverEntry = (
    step: "basic" | "story_macro" | "world" | "character" | "outline" | "structured" | "chapter" | "pipeline",
    variant: "default" | "outline" | "secondary" = "default",
  ) => {
    const takeoverContextTaskId = resolveTakeoverDialogContextTaskId({
      directorTaskId,
      activeAutoDirectorTask,
      projection: bookAutomationProjection,
    });

    return (
      <NovelExistingProjectTakeoverDialog
        novelId={id}
        basicForm={basicForm}
        genreOptions={genreOptions}
        storyModeOptions={storyModeOptions}
        worldOptions={worldListQuery.data?.data ?? []}
        triggerVariant={variant}
        defaultEntryStep={step}
        workflowTaskId={takeoverContextTaskId}
      />
    );
  };
  const activeStepTakeoverEntry = renderTakeoverEntry(
    activeTab === "story_macro"
      ? "story_macro"
      : activeTab === "world"
        ? "world"
      : activeTab === "character"
        ? "character"
        : activeTab === "outline"
          ? "outline"
          : activeTab === "structured"
            ? "structured"
            : activeTab === "chapter"
              ? "chapter"
              : activeTab === "pipeline"
                ? "pipeline"
                : "basic",
  );
  if (displayAutoDirectorTask?.checkpointType === "production_experience_required") {
    return (
      <NovelProductionExperienceHandoff
        taskId={displayAutoDirectorTask.id}
        novelId={id}
        novelTitle={basicForm.title}
      />
    );
  }
  return (
    <NovelEditView
      id={id}
      activeTab={activeTab}
      workflowCurrentTab={workflowCurrentTab}
      onActiveTabChange={setActiveTab}
      exportControls={{
        canExportCurrentStep: Boolean(currentExportScope),
        isExportingCurrentMarkdown,
        isExportingCurrentJson,
        isExportingFullMarkdown,
        isExportingFullJson,
        onExportCurrent: (format) => {
          if (!currentExportScope) {
            return;
          }
          exportNovelMutation.mutate({
            format,
            scope: currentExportScope,
            novelTitle: exportNovelTitle,
          });
        },
        onExportFull: (format) => {
          exportNovelMutation.mutate({
            format,
            scope: "full",
            novelTitle: exportNovelTitle,
          });
        },
      }}
      basicTab={basicTab}
      worldTab={basicTab}
      storyMacroTab={storyMacroTab}
      outlineTab={outlineTab}
      structuredTab={structuredTab}
      chapterTab={chapterTab}
      pipelineTab={pipelineTab}
      characterTab={characterTab}
      takeover={isTakeoverDismissed ? null : takeover}
      activeStepTakeoverEntry={activeStepTakeoverEntry}
      taskDrawer={{
        open: isTaskDrawerOpen,
        onOpenChange: (open) => {
          setIsTaskDrawerOpen(open);
          if (!open && taskPanelOpen) {
            clearTaskPanelOpen();
          }
        },
        task: displayAutoDirectorTask,
        snapshot: activeDirectorSnapshot,
        runtimeSnapshot: activeDirectorRuntimeSnapshot,
        projection: displayAutoDirectorTask?.status === "cancelled" ? null : bookAutomationProjection,
        currentUiModel: {
          provider: llm.provider,
          model: llm.model,
          temperature: llm.temperature,
        },
        actions: taskDrawerActions,
        onProjectionAction: handleTaskDrawerProjectionAction,
        followUp: activeAutoDirectorFollowUp,
        onFollowUpAction: handleDrawerFollowUpAction,
        executingFollowUpAction: executeFollowUpActionMutation.isPending,
        runtimeHardBlocked: activeDirectorRuntimeHardBlocked,
        runtimeBlockedReason: activeDirectorRuntimeBlockedReason,
        overrideModel: retryOverride,
        onOverrideModelChange: setRetryOverride,
        onRetryWithOverrideModel: () => retryAutoDirectorWithCurrentModelMutation.mutate(),
        retryWithOverrideModelPending: retryAutoDirectorWithCurrentModelMutation.isPending,
        canRetryWithOverrideModel: Boolean(retryOverride.provider && retryOverride.model.trim()),
        onRetryWithTaskModel: () => retryAutoDirectorWithTaskModelMutation.mutate(),
        retryWithTaskModelPending: retryAutoDirectorWithTaskModelMutation.isPending,
        capabilities: {
          availableActions: taskDrawerActions.length > 0,
          availableFollowUps: Boolean(activeAutoDirectorFollowUp),
          canAdjustRuntimePolicy: Boolean(activeDirectorRuntimeSnapshot && displayAutoDirectorTask),
          canInspectManualEditImpact: Boolean(displayAutoDirectorTask),
          canRetryWithOverrideModel: Boolean(displayAutoDirectorTask && (displayAutoDirectorTask.status === "failed" || displayAutoDirectorTask.status === "cancelled")),
          canCancel: Boolean(displayAutoDirectorTask && canCancelDirectorTask(displayAutoDirectorTask)),
          canArchive: Boolean(displayAutoDirectorTask && (displayAutoDirectorTask.status === "succeeded" || displayAutoDirectorTask.status === "failed" || displayAutoDirectorTask.status === "cancelled")),
        },
        resourceProposals: pendingCharacterResourceProposals,
        onOpenResourceProposalSource: (proposal) => {
          if (proposal.chapterId) {
            setSelectedChapterId(proposal.chapterId);
            setActiveTab("chapter");
          } else {
            setActiveTab("character");
          }
          setIsTaskDrawerOpen(false);
        },
        onConfirmResourceProposal: (proposalId) => confirmCharacterResourceProposalMutation.mutate(proposalId),
        onRejectResourceProposal: (proposalId) => rejectCharacterResourceProposalMutation.mutate(proposalId),
        confirmingResourceProposalId: confirmCharacterResourceProposalMutation.isPending
          ? confirmCharacterResourceProposalMutation.variables ?? ""
          : "",
        rejectingResourceProposalId: rejectCharacterResourceProposalMutation.isPending
          ? rejectCharacterResourceProposalMutation.variables ?? ""
          : "",
        onOpenFullTaskCenter: openAutoDirectorTaskCenter,
      }}
    />
  );
}
