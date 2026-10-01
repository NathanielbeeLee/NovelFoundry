import { useEffect } from "react";
import { takeoverDismissStorageKey } from "../../domain/novelEditSelectors";
import type { useNovelEditWorkspaceState } from "../useNovelEditWorkspaceState";
import type { useNovelEditDirectorProjection } from "./useNovelEditDirectorProjection";

interface UseNovelEditDirectorPresentationEffectsInput {
  state: ReturnType<typeof useNovelEditWorkspaceState>;
  director: ReturnType<typeof useNovelEditDirectorProjection>;
}

export function useNovelEditDirectorPresentationEffects({
  state,
  director,
}: UseNovelEditDirectorPresentationEffectsInput) {
  const {
    setRetryOverride,
    llm,
    autoOpenedFailedTaskId,
    setAutoOpenedFailedTaskId,
    setIsTaskDrawerOpen,
    taskPanelOpen,
    setIsDirectorExitActionExpanded,
    setDismissedTakeoverSignature,
    id,
  } = state;
  const { activeAutoDirectorTask, displayAutoDirectorTask, activeAutoDirectorRefreshSignature } = director;
  useEffect(() => {
    setRetryOverride({
      provider: llm.provider,
      model: llm.model,
      temperature: llm.temperature,
    });
  }, [activeAutoDirectorTask?.id, llm.model, llm.provider, llm.temperature]);
  useEffect(() => {
    if (activeAutoDirectorTask?.status !== "failed") {
      if (autoOpenedFailedTaskId) {
        setAutoOpenedFailedTaskId("");
      }
      return;
    }
    if (!activeAutoDirectorTask.id || activeAutoDirectorTask.id === autoOpenedFailedTaskId) {
      return;
    }
    setIsTaskDrawerOpen(true);
    setAutoOpenedFailedTaskId(activeAutoDirectorTask.id);
  }, [activeAutoDirectorTask?.id, activeAutoDirectorTask?.status, autoOpenedFailedTaskId]);
  useEffect(() => {
    if (!taskPanelOpen || !displayAutoDirectorTask?.id) {
      return;
    }
    setIsTaskDrawerOpen(true);
  }, [displayAutoDirectorTask?.id, taskPanelOpen]);
  useEffect(() => {
    if (!activeAutoDirectorTask) {
      setIsDirectorExitActionExpanded(false);
      setDismissedTakeoverSignature("");
      window.sessionStorage.removeItem(takeoverDismissStorageKey(id));
      return;
    }
    if (
      activeAutoDirectorTask.status !== "queued"
      && activeAutoDirectorTask.status !== "running"
      && activeAutoDirectorTask.status !== "waiting_approval"
    ) {
      setIsDirectorExitActionExpanded(false);
    }
  }, [activeAutoDirectorTask, id]);
  useEffect(() => {
    if (!id || !activeAutoDirectorRefreshSignature) {
      return;
    }
    const storedDismissedSignature = window.sessionStorage.getItem(takeoverDismissStorageKey(id)) ?? "";
    setDismissedTakeoverSignature(storedDismissedSignature);
  }, [activeAutoDirectorRefreshSignature, id]);
}
