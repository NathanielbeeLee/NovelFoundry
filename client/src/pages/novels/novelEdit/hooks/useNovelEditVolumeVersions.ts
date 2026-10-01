import { useVolumeVersionControl } from "../../hooks/useVolumeVersionControl";
import type { useNovelEditWorkspaceState } from "./useNovelEditWorkspaceState";
import type { useNovelEditVolumeWorkspace } from "./useNovelEditVolumeWorkspace";
import type { useNovelEditProductionRuntime } from "./production/useNovelEditProductionRuntime";

interface UseNovelEditVolumeVersionsInput {
  state: ReturnType<typeof useNovelEditWorkspaceState>;
  volumes: ReturnType<typeof useNovelEditVolumeWorkspace>;
  production: ReturnType<typeof useNovelEditProductionRuntime>;
}

export function useNovelEditVolumeVersions({ state, volumes, production }: UseNovelEditVolumeVersionsInput) {
  const {
    id,
    setVolumeDraft,
    setVolumeStrategyPlan,
    setVolumeCritiqueReport,
    setVolumeBeatSheets,
    setVolumeRebalanceDecisions,
    queryClient,
  } = state;
  const { draftVolumeDocument } = volumes;
  const { invalidateNovelDetail } = production;
  const {
    volumeMessage,
    volumeVersions,
    selectedVersionId,
    setSelectedVersionId,
    diffResult,
    impactResult,
    createDraftVersionMutation,
    activateVersionMutation,
    freezeVersionMutation,
    diffMutation,
    analyzeDraftImpactMutation,
    analyzeVersionImpactMutation,
    loadSelectedVersionToDraft,
  } = useVolumeVersionControl({
    novelId: id,
    draftDocument: draftVolumeDocument,
    setDraftVolumes: setVolumeDraft,
    setStrategyPlan: setVolumeStrategyPlan,
    setCritiqueReport: setVolumeCritiqueReport,
    setBeatSheets: setVolumeBeatSheets,
    setRebalanceDecisions: setVolumeRebalanceDecisions,
    queryClient,
    invalidateNovelDetail,
  });
  return {
    volumeMessage,
    volumeVersions,
    selectedVersionId,
    setSelectedVersionId,
    diffResult,
    impactResult,
    createDraftVersionMutation,
    activateVersionMutation,
    freezeVersionMutation,
    diffMutation,
    analyzeDraftImpactMutation,
    analyzeVersionImpactMutation,
    loadSelectedVersionToDraft,
  };
}
