import { useMemo } from "react";
import type { DirectorStepCalibrationAction } from "@novelfoundry/shared/types/novelDirector";
import { extractDirectorTaskSeedPayloadFromMeta } from "@novelfoundry/shared/types/novelDirector";
import { toast } from "@/components/ui/toast";
import type { NovelEditTakeoverState, NovelTaskDrawerState } from "../../../components/NovelEditView.types";
import { tabFromScope } from "../../../novelWorkspaceNavigation";
import {
  mapDashboardModeToTakeoverMode,
  resolveDirectorConsistencyIssue,
} from "../../domain/novelEditSelectors";
import { canCancelDirectorTask } from "@/lib/novelWorkflowTaskUi";
import {
  buildContinueAutoExecutionActionLabel,
  buildSkipQualityRepairActionLabel,
  buildTakeoverDescription,
  buildTakeoverTitle,
  formatTakeoverCheckpoint,
  resolveAutoExecutionScopeLabel,
} from "../../../novelEditTakeover.shared";
import {
  canArchiveCompletedAutoDirectorTask,
  resolveAutomationActionText,
  resolveTakeoverModeFromAutomation,
} from "../../../novelEditAutomationStatus";
import type { useNovelEditDirectorProjection } from "./useNovelEditDirectorProjection";
import type { useNovelEditWorkspaceData } from "../useNovelEditWorkspaceData";
import type { useNovelEditDirectorCommands } from "./useNovelEditDirectorCommands";
import type { useNovelEditVolumeWorkspace } from "../useNovelEditVolumeWorkspace";
import type { useNovelEditWorkspaceState } from "../useNovelEditWorkspaceState";

interface UseNovelEditDirectorTakeoverInput {
  director: ReturnType<typeof useNovelEditDirectorProjection>;
  data: ReturnType<typeof useNovelEditWorkspaceData>;
  commands: ReturnType<typeof useNovelEditDirectorCommands>;
  volumes: ReturnType<typeof useNovelEditVolumeWorkspace>;
  state: ReturnType<typeof useNovelEditWorkspaceState>;
}

export function useNovelEditDirectorTakeover({
  director,
  data,
  commands,
  volumes,
  state,
}: UseNovelEditDirectorTakeoverInput) {
  const {
    displayAutoDirectorTask,
    activeDirectorSnapshot,
    bookAutomationProjection,
    activeDirectorSession,
    activeChapterTitleWarning,
    activeAutoDirectorTask,
    consistencyIssue,
    reviewTab,
  } = director;
  const { characters, chapters, novelDetailQuery } = data;
  const {
    chapterTitleRepairMutation,
    openCandidateSelection,
    continueAutoDirectorMutation,
    calibrateDirectorStepMutation,
    acceptManualChangesAndContinueMutation,
    continueAutoExecutionMutation,
    openChapterExecution,
    openQualityRepair,
    cancelAutoDirectorMutation,
    dismissTakeover,
    archiveCompletedAutoDirectorMutation,
    openReviewStage,
  } = commands;
  const { hasUnsavedVolumeDraft } = volumes;
  const {
    activeTab,
    setActiveTab,
    setSelectedChapterId,
    isDirectorExitActionExpanded,
    setIsDirectorExitActionExpanded,
    setIsTaskDrawerOpen,
  } = state;
  const takeover = useMemo<NovelEditTakeoverState | null>(() => {
    const task = displayAutoDirectorTask;
    if (!task) {
      return null;
    }
    const consistencyIssue = resolveDirectorConsistencyIssue({
      checkpointType: task.checkpointType,
      characterCount: characters.length,
      chapterCount: chapters.length,
    });
    const dashboardView = activeDirectorSnapshot?.dashboardView ?? null;
    const mode = mapDashboardModeToTakeoverMode(dashboardView?.mode)
      ?? resolveTakeoverModeFromAutomation({
      task,
      projection: bookAutomationProjection,
    });
    const automationActionText = resolveAutomationActionText({
      task,
      projection: bookAutomationProjection,
    });
    const novelTitle = novelDetailQuery.data?.data?.title?.trim() || task.title?.trim() || "当前项目";
    const reviewScope = activeDirectorSession?.reviewScope ?? null;
    const autoExecutionScopeLabel = resolveAutoExecutionScopeLabel(task);
    const actions: NonNullable<NovelEditTakeoverState["actions"]> = [];
    if (activeChapterTitleWarning) {
      actions.push({
        label: chapterTitleRepairMutation.isPending && chapterTitleRepairMutation.pendingTaskId === task.id
          ? "AI 修复中..."
          : activeChapterTitleWarning.label,
        onClick: () => {
          if (hasUnsavedVolumeDraft) {
            toast.error("当前拆章工作区还有未保存修改，请先保存工作区，再发起 AI 修复标题。");
            return;
          }
          chapterTitleRepairMutation.startRepair(task);
        },
        variant: mode === "failed" ? "default" : "outline",
        disabled: chapterTitleRepairMutation.isPending,
      });
    }
    const reviewTab = tabFromScope(reviewScope);
    if (
      mode === "waiting"
      && task.checkpointType === "candidate_selection_required"
    ) {
      actions.push({
        label: "去确认书级方向",
        onClick: () => openCandidateSelection(task.id),
        variant: "default",
      });
    } else if (
      (mode === "waiting" || mode === "action_required")
      && reviewTab
      && reviewTab !== activeTab
      && task.checkpointType !== "chapter_batch_ready"
    ) {
      actions.push({
        label: "去当前审核阶段",
        onClick: () => setActiveTab(reviewTab),
        variant: "outline",
      });
    }
    if (task.pendingManualRecovery) {
      actions.push({
        label: continueAutoDirectorMutation.isPending ? "继续中..." : "继续自动导演",
        onClick: () => continueAutoDirectorMutation.mutate({ directorTaskId: task.id }),
        variant: "default",
        disabled: continueAutoDirectorMutation.isPending,
      });
    } else if (mode === "waiting" && task.checkpointType === "step_review_required") {
      const stepReview = extractDirectorTaskSeedPayloadFromMeta(task.meta)?.stepReview;
      const stepId = stepReview?.stepId?.trim() || task.currentItemKey?.trim() || "";
      const requestCalibrationInstruction = (action: DirectorStepCalibrationAction): string | null | undefined => {
        if (action === "validate") {
          return null;
        }
        const value = window.prompt("告诉 AI 这一步需要调整什么（可留空）", "");
        return value === null ? undefined : value.trim();
      };
      if (stepId) {
        actions.push({
          label: calibrateDirectorStepMutation.isPending ? "检查中..." : "AI 检查当前步骤",
          onClick: () => calibrateDirectorStepMutation.mutate({
            directorTaskId: task.id,
            stepId,
            action: "validate",
          }),
          variant: "outline",
          disabled: calibrateDirectorStepMutation.isPending,
        });
        actions.push({
          label: calibrateDirectorStepMutation.isPending ? "完善中..." : "AI 完善当前步骤",
          onClick: () => {
            const instruction = requestCalibrationInstruction("improve");
            if (instruction !== undefined) {
              calibrateDirectorStepMutation.mutate({ directorTaskId: task.id, stepId, action: "improve", instruction });
            }
          },
          variant: "outline",
          disabled: calibrateDirectorStepMutation.isPending,
        });
        actions.push({
          label: calibrateDirectorStepMutation.isPending ? "生成中..." : "重新生成当前步骤",
          onClick: () => {
            const instruction = requestCalibrationInstruction("regenerate");
            if (instruction !== undefined) {
              calibrateDirectorStepMutation.mutate({ directorTaskId: task.id, stepId, action: "regenerate", instruction });
            }
          },
          variant: "outline",
          disabled: calibrateDirectorStepMutation.isPending,
        });
      }
      actions.push({
        label: acceptManualChangesAndContinueMutation.isPending ? "确认中..." : "保存并确认",
        onClick: () => acceptManualChangesAndContinueMutation.mutate(task.id),
        variant: "default",
        disabled: acceptManualChangesAndContinueMutation.isPending,
      });
      actions.push({
        label: acceptManualChangesAndContinueMutation.isPending ? "继续中..." : "继续自动导演",
        onClick: () => acceptManualChangesAndContinueMutation.mutate(task.id),
        variant: "outline",
        disabled: acceptManualChangesAndContinueMutation.isPending,
      });
    } else if (mode === "waiting" && task.checkpointType === "chapter_batch_ready") {
      actions.push({
        label: buildContinueAutoExecutionActionLabel(autoExecutionScopeLabel, continueAutoExecutionMutation.isPending),
        onClick: () => continueAutoExecutionMutation.mutate({ directorTaskId: task.id }),
        variant: "default",
        disabled: continueAutoExecutionMutation.isPending,
      });
      actions.push({
        label: "进入章节执行",
        onClick: () => {
          if (task.resumeTarget?.chapterId) {
            setSelectedChapterId(task.resumeTarget.chapterId);
          }
          setActiveTab("chapter");
        },
        variant: "outline",
      });
    } else if (mode === "waiting" && task.checkpointType === "workflow_completed") {
      actions.push({
        label: "进入章节执行",
        onClick: () => openChapterExecution(task),
        variant: "default",
      });
    } else if (mode === "action_required" && task.checkpointType === "replan_required") {
      actions.push({
        label: buildSkipQualityRepairActionLabel(autoExecutionScopeLabel, continueAutoExecutionMutation.isPending),
        onClick: () => continueAutoExecutionMutation.mutate({
          directorTaskId: task.id,
          continuationMode: "skip_quality_repair",
        }),
        variant: "default",
        disabled: continueAutoExecutionMutation.isPending,
      });
      actions.push({
        label: "打开质量修复",
        onClick: () => openQualityRepair(task),
        variant: "outline",
      });
    } else if (mode === "waiting") {
      actions.push({
        label: continueAutoDirectorMutation.isPending ? "继续中..." : "继续自动导演",
        onClick: () => continueAutoDirectorMutation.mutate({ directorTaskId: task.id }),
        variant: "default",
        disabled: continueAutoDirectorMutation.isPending,
      });
    }
    if (mode === "failed" && task.checkpointType === "chapter_batch_ready") {
      actions.push({
        label: buildContinueAutoExecutionActionLabel(autoExecutionScopeLabel, continueAutoExecutionMutation.isPending),
        onClick: () => continueAutoExecutionMutation.mutate({ directorTaskId: task.id }),
        variant: "default",
        disabled: continueAutoExecutionMutation.isPending,
      });
      actions.push({
        label: "打开质量修复",
        onClick: () => openQualityRepair(task),
        variant: "outline",
      });
    }
    if (consistencyIssue) {
      actions.push({
        label: continueAutoDirectorMutation.isPending ? "修复中..." : "补齐导演产物",
        onClick: () => continueAutoDirectorMutation.mutate({ directorTaskId: task.id }),
        variant: "default",
        disabled: continueAutoDirectorMutation.isPending,
      });
      if (consistencyIssue === "missing_characters") {
        actions.push({
          label: "去角色准备",
          onClick: () => setActiveTab("character"),
          variant: "outline",
        });
      }
    } else if (task.checkpointType === "chapter_batch_ready" && mode !== "waiting") {
      actions.push({
        label: "进入章节执行",
        onClick: () => {
          if (task.resumeTarget?.chapterId) {
            setSelectedChapterId(task.resumeTarget.chapterId);
          }
          setActiveTab("chapter");
        },
        variant: mode === "running" ? "outline" : "default",
      });
    }
    const canCancelTask = canCancelDirectorTask(task);
    if (canCancelTask) {
      if (task.status === "failed") {
        actions.push({
          label: cancelAutoDirectorMutation.isPending ? "取消中..." : "取消任务",
          onClick: () => cancelAutoDirectorMutation.mutate(task.id),
          variant: "destructive",
          disabled: cancelAutoDirectorMutation.isPending,
        });
      } else if (isDirectorExitActionExpanded) {
        actions.push({
          label: "继续导演",
          onClick: () => setIsDirectorExitActionExpanded(false),
          variant: "outline",
          disabled: cancelAutoDirectorMutation.isPending,
        });
        actions.push({
          label: cancelAutoDirectorMutation.isPending ? "退出中..." : "退出导演模式",
          onClick: () => cancelAutoDirectorMutation.mutate(task.id),
          variant: "destructive",
          disabled: cancelAutoDirectorMutation.isPending,
        });
      } else {
        actions.push({
          label: "退出导演模式",
          onClick: () => setIsDirectorExitActionExpanded(true),
          variant: "destructive",
          disabled: cancelAutoDirectorMutation.isPending,
        });
      }
    } else if (
      task.status === "failed"
      || task.status === "cancelled"
    ) {
      actions.push({
        label: "收起此提醒",
        onClick: dismissTakeover,
        variant: "secondary",
      });
    } else if (canArchiveCompletedAutoDirectorTask(task)) {
      actions.push({
        label: archiveCompletedAutoDirectorMutation.isPending ? "收起中..." : "完成并收起",
        onClick: () => archiveCompletedAutoDirectorMutation.mutate(task.id),
        variant: "secondary",
        disabled: archiveCompletedAutoDirectorMutation.isPending,
      });
    } else if (task.status === "waiting_approval") {
      actions.push({
        label: "收起此提醒",
        onClick: dismissTakeover,
        variant: "secondary",
      });
    }
    actions.push({
      label: "执行详情",
      onClick: () => setIsTaskDrawerOpen(true),
      variant: mode === "running" ? "outline" : "secondary",
    });

    return {
      mode,
      title: consistencyIssue === "missing_characters"
        ? `《${novelTitle}》导演产物未补齐角色准备`
        : consistencyIssue === "missing_chapters"
          ? `《${novelTitle}》导演产物未连接到章节执行区`
          : task.pendingManualRecovery
            ? `《${novelTitle}》等待从检查点恢复`
          : buildTakeoverTitle({
            mode,
            novelTitle,
            checkpointType: task.checkpointType,
            scopeLabel: autoExecutionScopeLabel,
          }),
      description: consistencyIssue === "missing_characters"
        ? "任务记录显示已完成开书交接，但当前项目里还没有角色资产，所以角色准备和章节执行都不完整。可以直接补齐导演产物，系统会继续修复。"
        : consistencyIssue === "missing_chapters"
          ? "任务记录显示前几章已经可开写，但当前章节执行区还是空的，说明导演产物还没有完整落库。可以直接补齐导演产物继续修复。"
          : task.pendingManualRecovery
            ? "任务已停在当前进度。你可以查看执行详情，再从最近进度点继续。"
          : buildTakeoverDescription({
            mode,
            checkpointType: task.checkpointType,
            reviewScope,
            scopeLabel: autoExecutionScopeLabel,
          }),
      progress: typeof dashboardView?.progressPercent === "number"
        ? dashboardView.progressPercent
        : task.progress,
      currentAction: consistencyIssue === "missing_characters"
        ? "检测到角色准备仍为空，当前导演结果需要继续补齐。"
        : consistencyIssue === "missing_chapters"
          ? "检测到章节执行区为空，当前导演结果需要继续同步章节资源。"
          : task.pendingManualRecovery
            ? (
              task.blockingReason?.trim()
              || task.recoveryHint?.trim()
              || task.lastError?.trim()
              || "任务已暂停，等待从最近检查点恢复。"
            )
          : dashboardView?.currentAction?.trim()
            ? dashboardView.currentAction.trim()
          : activeDirectorSnapshot?.displayState.currentAction?.trim()
            ? activeDirectorSnapshot.displayState.currentAction.trim()
          : automationActionText
            ? automationActionText
          : mode === "running" && task.checkpointType === "chapter_batch_ready" && task.currentItemLabel?.includes("已暂停")
            ? `正在继续自动执行${autoExecutionScopeLabel}`
            : task.currentItemLabel ?? null,
      checkpointLabel: consistencyIssue
        ? "导演产物待补齐"
        : task.pendingManualRecovery
          ? "等待恢复"
        : mode === "running" && task.checkpointType === "chapter_batch_ready"
          ? `${autoExecutionScopeLabel}自动执行中`
          : formatTakeoverCheckpoint(task.checkpointType, task),
      taskId: task.id,
      actions,
    };
  }, [
    activeAutoDirectorTask,
    activeChapterTitleWarning,
    activeDirectorSnapshot?.dashboardView,
    activeDirectorSnapshot?.displayState.currentAction,
    activeDirectorSession,
    activeTab,
    archiveCompletedAutoDirectorMutation,
    bookAutomationProjection,
    chapters.length,
    chapterTitleRepairMutation,
    characters.length,
    cancelAutoDirectorMutation,
    continueAutoDirectorMutation,
    continueAutoExecutionMutation,
    dismissTakeover,
    hasUnsavedVolumeDraft,
    isDirectorExitActionExpanded,
    novelDetailQuery.data?.data?.title,
    openCandidateSelection,
    openQualityRepair,
    displayAutoDirectorTask,
    setActiveTab,
    setSelectedChapterId,
  ]);
  const taskDrawerActions = useMemo<NovelTaskDrawerState["actions"]>(() => {
    const task = displayAutoDirectorTask;
    if (!task) {
      return [];
    }
    const actions: NovelTaskDrawerState["actions"] = [];
    if (activeChapterTitleWarning) {
      actions.push({
        label: chapterTitleRepairMutation.isPending && chapterTitleRepairMutation.pendingTaskId === task.id
          ? "AI 修复中..."
          : activeChapterTitleWarning.label,
        onClick: () => {
          if (hasUnsavedVolumeDraft) {
            toast.error("当前拆章工作区还有未保存修改，请先保存工作区，再发起 AI 修复标题。");
            return;
          }
          chapterTitleRepairMutation.startRepair(task);
        },
        variant: "default",
        disabled: chapterTitleRepairMutation.isPending,
      });
    }
    if (consistencyIssue) {
      actions.push({
        label: continueAutoDirectorMutation.isPending ? "补齐中..." : "补齐导演产物",
        onClick: () => continueAutoDirectorMutation.mutate({ directorTaskId: task.id }),
        variant: "default",
        disabled: continueAutoDirectorMutation.isPending,
      });
      if (consistencyIssue === "missing_characters") {
        actions.push({
          label: "去角色准备",
          onClick: () => {
            setActiveTab("character");
            setIsTaskDrawerOpen(false);
          },
          variant: "outline",
        });
      }
    } else if (task.pendingManualRecovery) {
      actions.push({
        label: continueAutoDirectorMutation.isPending ? "继续中..." : "继续自动导演",
        onClick: () => continueAutoDirectorMutation.mutate({ directorTaskId: task.id }),
        variant: "default",
        disabled: continueAutoDirectorMutation.isPending,
      });
    } else if (
      task.status === "waiting_approval"
      && task.checkpointType === "chapter_batch_ready"
    ) {
      const autoExecutionScopeLabel = resolveAutoExecutionScopeLabel(task);
      actions.push({
        label: buildContinueAutoExecutionActionLabel(autoExecutionScopeLabel, continueAutoExecutionMutation.isPending),
        onClick: () => continueAutoExecutionMutation.mutate({ directorTaskId: task.id }),
        variant: "default",
        disabled: continueAutoExecutionMutation.isPending,
      });
      actions.push({
        label: "进入章节执行",
        onClick: () => openChapterExecution(task),
        variant: "outline",
      });
    } else if (task.status === "waiting_approval" && task.checkpointType === "candidate_selection_required") {
      actions.push({
        label: "去确认书级方向",
        onClick: () => openCandidateSelection(task.id),
        variant: "default",
      });
    } else if (task.status === "waiting_approval" && task.checkpointType === "replan_required") {
      const autoExecutionScopeLabel = resolveAutoExecutionScopeLabel(task);
      actions.push({
        label: buildSkipQualityRepairActionLabel(autoExecutionScopeLabel, continueAutoExecutionMutation.isPending),
        onClick: () => continueAutoExecutionMutation.mutate({
          directorTaskId: task.id,
          continuationMode: "skip_quality_repair",
        }),
        variant: "default",
        disabled: continueAutoExecutionMutation.isPending,
      });
      actions.push({
        label: "打开质量修复",
        onClick: () => openQualityRepair(task),
        variant: "outline",
      });
    } else if (
      task.status === "waiting_approval"
      && reviewTab
      && task.checkpointType !== "chapter_batch_ready"
    ) {
      actions.push({
        label: "去当前审核阶段",
        onClick: openReviewStage,
        variant: "default",
      });
      actions.push({
        label: continueAutoDirectorMutation.isPending ? "继续中..." : "继续自动导演",
        onClick: () => continueAutoDirectorMutation.mutate({ directorTaskId: task.id }),
        variant: "outline",
        disabled: continueAutoDirectorMutation.isPending,
      });
    } else if ((task.status === "failed" || task.status === "cancelled") && task.checkpointType === "chapter_batch_ready") {
      const autoExecutionScopeLabel = resolveAutoExecutionScopeLabel(task);
      actions.push({
        label: buildContinueAutoExecutionActionLabel(autoExecutionScopeLabel, continueAutoExecutionMutation.isPending),
        onClick: () => continueAutoExecutionMutation.mutate({ directorTaskId: task.id }),
        variant: "default",
        disabled: continueAutoExecutionMutation.isPending,
      });
      actions.push({
        label: "打开质量修复",
        onClick: () => openQualityRepair(task),
        variant: "outline",
      });
    } else if (task.checkpointType === "chapter_batch_ready" || task.checkpointType === "workflow_completed") {
      actions.push({
        label: "进入章节执行",
        onClick: () => openChapterExecution(task),
        variant: "default",
      });
    }

    if (canCancelDirectorTask(task)) {
      actions.push({
        label: cancelAutoDirectorMutation.isPending ? "取消中..." : "取消任务",
        onClick: () => cancelAutoDirectorMutation.mutate(task.id),
        variant: "destructive",
        disabled: cancelAutoDirectorMutation.isPending,
      });
    }
    return actions;
  }, [
    activeChapterTitleWarning,
    cancelAutoDirectorMutation,
    chapterTitleRepairMutation,
    consistencyIssue,
    continueAutoDirectorMutation,
    continueAutoExecutionMutation,
    displayAutoDirectorTask,
    hasUnsavedVolumeDraft,
    openCandidateSelection,
    openReviewStage,
    openChapterExecution,
    openQualityRepair,
    reviewTab,
    setActiveTab,
  ]);
  return {
    takeover,
    taskDrawerActions,
  };
}
