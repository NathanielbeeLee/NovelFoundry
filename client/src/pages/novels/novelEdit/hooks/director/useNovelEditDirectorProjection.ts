import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DirectorSessionState } from "@novelfoundry/shared/types/novelDirector";
import { getDirectorBookAutomationProjection, getDirectorTaskSnapshot } from "@/api/novelDirector";
import { getActiveAutoDirectorTask } from "@/api/novelWorkflow";
import { getTaskDetail } from "@/api/tasks";
import { getAutoDirectorFollowUpDetail } from "@/api/autoDirectorFollowUps";
import { queryKeys } from "@/api/queryKeys";
import { useDirectorRealtimeStore } from "@/store/directorRealtimeStore";
import {
  tabFromDirectorDisplayStage,
  tabFromDirectorProgress,
  tabFromScope,
} from "../../../novelWorkspaceNavigation";
import { resolveChapterTitleWarning } from "@/lib/directorTaskNotice";
import {
  resolveActiveStructuredOutlineChapterId,
  resolveDirectorConsistencyIssue,
} from "../../domain/novelEditSelectors";
import { resolveAutoExecutionScopeLabel } from "../../../novelEditTakeover.shared";
import {
  buildDisplayAutoDirectorTask,
  shouldPreserveRequestedDirectorTaskId,
  shouldAutofocusProjectedDirectorTask,
} from "../../../novelEditAutomationStatus";
import type { useNovelEditWorkspaceState } from "../useNovelEditWorkspaceState";
import type { useNovelEditWorkspaceData } from "../useNovelEditWorkspaceData";

interface UseNovelEditDirectorProjectionInput {
  state: ReturnType<typeof useNovelEditWorkspaceState>;
  data: ReturnType<typeof useNovelEditWorkspaceData>;
}

export function useNovelEditDirectorProjection({ state, data }: UseNovelEditDirectorProjectionInput) {
  const { id, directorTaskId, taskPanelOpen, setDirectorTaskId, dismissedTakeoverSignature } = state;
  const { characters, chapters } = data;
  const activeAutoDirectorTaskQuery = useQuery({
    queryKey: queryKeys.novels.autoDirectorTask(id),
    queryFn: () => getActiveAutoDirectorTask(id),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const task = query.state.data?.data;
      return task && (task.status === "queued" || task.status === "running" || task.status === "waiting_approval")
        ? 4000
        : false;
    },
  });
  const bookAutomationQuery = useQuery({
    queryKey: queryKeys.novels.directorBookAutomation(id),
    queryFn: () => getDirectorBookAutomationProjection(id),
    enabled: Boolean(id),
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.data?.projection.status;
      return status === "queued" || status === "running" || status === "waiting_approval" ? 4000 : false;
    },
  });
  const hasValidatedActiveAutoDirectorTask = activeAutoDirectorTaskQuery.isFetchedAfterMount;
  const latestAutoDirectorTask = hasValidatedActiveAutoDirectorTask
    ? activeAutoDirectorTaskQuery.data?.data ?? null
    : null;
  const activeDirectorTask = latestAutoDirectorTask?.status === "cancelled"
    ? null
    : latestAutoDirectorTask;
  const activeAutoDirectorTask = activeDirectorTask;
  const bookAutomationProjection = bookAutomationQuery.data?.data?.projection ?? null;
  const requestedDirectorTaskId = directorTaskId
    || activeAutoDirectorTask?.id
    || (shouldAutofocusProjectedDirectorTask(bookAutomationProjection) ? bookAutomationProjection?.latestTask?.id : "")
    || "";
  const requestedDirectorTaskQuery = useQuery({
    queryKey: queryKeys.tasks.detail("novel_workflow", requestedDirectorTaskId || "none"),
    queryFn: () => getTaskDetail("novel_workflow", requestedDirectorTaskId),
    enabled: Boolean(requestedDirectorTaskId),
    retry: false,
  });
  const requestedDirectorTask = requestedDirectorTaskQuery.data?.data ?? null;
  const visibleDirectorTask = useMemo(
    () => {
      const sourceTask = requestedDirectorTask ?? activeAutoDirectorTask;
      if (!directorTaskId && !taskPanelOpen && sourceTask?.status === "cancelled") {
        return null;
      }
      return buildDisplayAutoDirectorTask(sourceTask, bookAutomationProjection);
    },
    [activeAutoDirectorTask, bookAutomationProjection, directorTaskId, requestedDirectorTask, taskPanelOpen],
  );
  const displayAutoDirectorTask = visibleDirectorTask;
  const actionTargetDirectorTaskId = visibleDirectorTask?.id ?? "";
  const selectedDirectorTaskId = visibleDirectorTask?.id ?? requestedDirectorTaskId;
  useEffect(() => {
    if (!id || !activeAutoDirectorTaskQuery.isSuccess) {
      return;
    }
    const canonicalDirectorTaskId = activeAutoDirectorTask?.id ?? "";
    if (!canonicalDirectorTaskId && taskPanelOpen && directorTaskId) {
      return;
    }
    if (!canonicalDirectorTaskId && directorTaskId && !requestedDirectorTaskQuery.isFetched) {
      return;
    }
    if (!canonicalDirectorTaskId && shouldPreserveRequestedDirectorTaskId({
      directorTaskId,
      requestedTask: requestedDirectorTask,
    })) {
      return;
    }
    if (directorTaskId === canonicalDirectorTaskId) {
      return;
    }
    setDirectorTaskId(canonicalDirectorTaskId);
  }, [
    activeAutoDirectorTask?.id,
    activeAutoDirectorTaskQuery.isSuccess,
    directorTaskId,
    id,
    requestedDirectorTask,
    requestedDirectorTaskQuery.isFetched,
    setDirectorTaskId,
    taskPanelOpen,
  ]);
  useEffect(() => {
    if (!id || !activeAutoDirectorTaskQuery.isSuccess) {
      return;
    }
    useDirectorRealtimeStore.getState().setFromAutoDirectorTask(id, activeAutoDirectorTask);
  }, [id, activeAutoDirectorTask, activeAutoDirectorTaskQuery.isSuccess]);
  const activeDirectorSession = useMemo(() => {
    if (
      !activeAutoDirectorTask
      || (
        activeAutoDirectorTask.status !== "queued"
        && activeAutoDirectorTask.status !== "running"
        && activeAutoDirectorTask.status !== "waiting_approval"
      )
    ) {
      return null;
    }
    const raw = activeAutoDirectorTask?.meta.directorSession;
    if (!raw || typeof raw !== "object") {
      return null;
    }
    return raw as DirectorSessionState;
  }, [activeAutoDirectorTask]);
  const visibleAutoExecutionScopeLabel = resolveAutoExecutionScopeLabel(visibleDirectorTask);
  const activeAutoExecutionScopeLabel = visibleAutoExecutionScopeLabel;
  const activeChapterTitleWarning = useMemo(
    () => resolveChapterTitleWarning(displayAutoDirectorTask),
    [displayAutoDirectorTask],
  );
  const directorTaskSnapshotQuery = useQuery({
    queryKey: queryKeys.tasks.directorTaskSnapshot(selectedDirectorTaskId || "none"),
    queryFn: () => getDirectorTaskSnapshot(selectedDirectorTaskId),
    enabled: Boolean(selectedDirectorTaskId),
    retry: false,
    refetchInterval: () => (
      displayAutoDirectorTask && (
        displayAutoDirectorTask.status === "queued"
        || displayAutoDirectorTask.status === "running"
        || displayAutoDirectorTask.status === "waiting_approval"
      )
        ? 4000
        : false
    ),
  });
  const activeDirectorSnapshot = directorTaskSnapshotQuery.data?.data?.snapshot ?? null;
  const activeStructuredOutlineChapterId = useMemo(
    () => resolveActiveStructuredOutlineChapterId(activeDirectorSnapshot),
    [activeDirectorSnapshot],
  );
  const activeDirectorRuntimeSnapshot = activeDirectorSnapshot?.runtime ?? null;
  const activeDirectorRuntimeProjection = activeDirectorSnapshot?.projection ?? null;
  const activeDirectorDashboardView = activeDirectorSnapshot?.dashboardView ?? null;
  const activeDirectorRuntimeHardBlocked = activeDirectorDashboardView?.mode === "failed"
    || activeDirectorDashboardView?.mode === "recovering"
    || (
      activeDirectorDashboardView?.mode !== "running"
      && activeDirectorRuntimeProjection?.status === "blocked"
    );
  const activeDirectorRuntimeBlockedReason = activeDirectorDashboardView?.userActionReason?.trim()
    || activeDirectorRuntimeProjection?.blockedReason?.trim()
    || activeDirectorRuntimeProjection?.detail?.trim()
    || null;
  const activeAutoDirectorFollowUpQuery = useQuery({
    queryKey: queryKeys.autoDirectorFollowUps.detail(selectedDirectorTaskId || "none"),
    queryFn: () => getAutoDirectorFollowUpDetail(selectedDirectorTaskId),
    enabled: Boolean(selectedDirectorTaskId),
    retry: false,
    refetchInterval: () => (
      displayAutoDirectorTask && (
        displayAutoDirectorTask.status === "queued"
        || displayAutoDirectorTask.status === "running"
        || displayAutoDirectorTask.status === "waiting_approval"
      )
        ? 4000
        : false
    ),
  });
  const activeAutoDirectorFollowUp = activeAutoDirectorFollowUpQuery.data?.data ?? null;
  const workflowCurrentTab = useMemo(
    () => {
      const displayStageTab = tabFromDirectorDisplayStage(activeDirectorSnapshot?.displayState.stageKey ?? null);
      if (displayStageTab) {
        return displayStageTab;
      }
      return tabFromDirectorProgress({
        currentStage: activeAutoDirectorTask?.currentStage,
        currentItemKey: activeAutoDirectorTask?.currentItemKey,
        checkpointType: activeAutoDirectorTask?.checkpointType,
        reviewScope: activeDirectorSession?.reviewScope ?? null,
        status: activeAutoDirectorTask?.status,
      });
    },
    [
      activeDirectorSnapshot?.displayState.stageKey,
      activeAutoDirectorTask?.checkpointType,
      activeAutoDirectorTask?.currentItemKey,
      activeAutoDirectorTask?.currentStage,
      activeDirectorSession?.reviewScope,
      activeAutoDirectorTask?.status,
    ],
  );
  const autoDirectorRefreshSignatureRef = useRef("");
  const autoDirectorArtifactSignatureRef = useRef("");
  const autoDirectorWorkspaceSignatureRef = useRef("");
  const activeAutoDirectorRefreshSignature = useMemo(() => {
    if (!activeAutoDirectorTask) {
      return "";
    }
    return [
      activeAutoDirectorTask.id,
      activeAutoDirectorTask.status,
      activeAutoDirectorTask.pendingManualRecovery ? "manual_recovery" : "",
      activeAutoDirectorTask.currentStage ?? "",
      activeAutoDirectorTask.currentItemKey ?? "",
      activeAutoDirectorTask.checkpointType ?? "",
    ].join("|");
  }, [
    activeAutoDirectorTask,
    activeAutoDirectorTask?.checkpointType,
    activeAutoDirectorTask?.currentItemKey,
    activeAutoDirectorTask?.currentStage,
    activeAutoDirectorTask?.id,
    activeAutoDirectorTask?.pendingManualRecovery,
    activeAutoDirectorTask?.status,
  ]);
  const activeAutoDirectorArtifactSignature = useMemo(() => {
    if (!activeAutoDirectorTask) {
      return "";
    }
    const milestoneCount = Array.isArray(activeAutoDirectorTask.meta?.milestones)
      ? activeAutoDirectorTask.meta.milestones.length
      : 0;
    return [
      activeAutoDirectorTask.status,
      activeAutoDirectorTask.checkpointType ?? "",
      activeAutoDirectorTask.meta?.directorSession && typeof activeAutoDirectorTask.meta.directorSession === "object"
        ? JSON.stringify((activeAutoDirectorTask.meta.directorSession as { phase?: unknown }).phase ?? "")
        : "",
      milestoneCount,
    ].join("|");
  }, [
    activeAutoDirectorTask,
    activeAutoDirectorTask?.checkpointType,
    activeAutoDirectorTask?.meta,
    activeAutoDirectorTask?.status,
  ]);
  const activeAutoDirectorWorkspaceSignature = useMemo(() => {
    if (!activeAutoDirectorTask || !activeDirectorSnapshot) {
      return "";
    }
    const latestEvent = activeDirectorSnapshot.recentEvents.at(-1);
    const progressBreakdown = activeDirectorSnapshot.projection?.progressBreakdown;
    return [
      activeAutoDirectorTask.id,
      activeAutoDirectorTask.status,
      activeDirectorSnapshot.displayState.stageKey,
      activeDirectorSnapshot.currentFactStepId ?? "",
      activeDirectorSnapshot.displayState.progressPercent,
      progressBreakdown?.planningPercent ?? "",
      progressBreakdown?.chapterExecutionPercent ?? "",
      progressBreakdown?.qualityRepairPercent ?? "",
      progressBreakdown?.activeJobProgress ?? "",
      latestEvent?.eventId ?? "",
      activeDirectorSnapshot.artifacts.length,
      activeDirectorSnapshot.task.currentItemKey ?? "",
      activeDirectorSnapshot.task.checkpointType ?? "",
    ].join("|");
  }, [activeAutoDirectorTask, activeDirectorSnapshot]);
  const isTakeoverDismissed = Boolean(
    activeAutoDirectorRefreshSignature
    && dismissedTakeoverSignature
    && dismissedTakeoverSignature === activeAutoDirectorRefreshSignature,
  );
  const consistencyIssue = useMemo(
    () => resolveDirectorConsistencyIssue({
      checkpointType: activeAutoDirectorTask?.checkpointType,
      characterCount: characters.length,
      chapterCount: chapters.length,
    }),
    [activeAutoDirectorTask?.checkpointType, chapters.length, characters.length],
  );
  const reviewScope = activeDirectorSession?.reviewScope ?? null;
  const reviewTab = useMemo(() => tabFromScope(reviewScope), [reviewScope]);
  return {
    activeAutoDirectorTask,
    bookAutomationProjection,
    visibleDirectorTask,
    displayAutoDirectorTask,
    actionTargetDirectorTaskId,
    activeDirectorSession,
    activeAutoExecutionScopeLabel,
    activeChapterTitleWarning,
    activeDirectorSnapshot,
    activeStructuredOutlineChapterId,
    activeDirectorRuntimeSnapshot,
    activeDirectorRuntimeHardBlocked,
    activeDirectorRuntimeBlockedReason,
    activeAutoDirectorFollowUp,
    workflowCurrentTab,
    autoDirectorRefreshSignatureRef,
    autoDirectorArtifactSignatureRef,
    autoDirectorWorkspaceSignatureRef,
    activeAutoDirectorRefreshSignature,
    activeAutoDirectorArtifactSignature,
    activeAutoDirectorWorkspaceSignature,
    isTakeoverDismissed,
    consistencyIssue,
    reviewTab,
  };
}
