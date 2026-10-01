import { useNovelEditWorkspaceState } from "./useNovelEditWorkspaceState";
import { useNovelEditWorkspaceData } from "./useNovelEditWorkspaceData";
import { useNovelEditVolumeWorkspace } from "./useNovelEditVolumeWorkspace";
import { useNovelEditDirectorProjection } from "./director/useNovelEditDirectorProjection";
import { useNovelEditDirectorCommands } from "./director/useNovelEditDirectorCommands";
import { useNovelEditDirectorPresentationEffects } from "./director/useNovelEditDirectorPresentationEffects";
import { useNovelEditDirectorTakeover } from "./director/useNovelEditDirectorTakeover";
import { useNovelEditWorkspaceSynchronization } from "./useNovelEditWorkspaceSynchronization";
import { useNovelEditProductionRuntime } from "./production/useNovelEditProductionRuntime";
import { useNovelEditVolumeVersions } from "./useNovelEditVolumeVersions";
import { useNovelEditExport } from "./useNovelEditExport";

export function useNovelEditWorkspace() {
  const state = useNovelEditWorkspaceState();
  const data = useNovelEditWorkspaceData({ state });
  const volumes = useNovelEditVolumeWorkspace({ state, data });
  const director = useNovelEditDirectorProjection({ state, data });
  const commands = useNovelEditDirectorCommands({ director, state, data });
  useNovelEditDirectorPresentationEffects({ state, director });
  const takeover = useNovelEditDirectorTakeover({ director, data, commands, volumes, state });
  useNovelEditWorkspaceSynchronization({ data, state, director, volumes, commands });
  const production = useNovelEditProductionRuntime({ state, data, volumes });
  const versions = useNovelEditVolumeVersions({ state, volumes, production });
  const exporting = useNovelEditExport({ state, data });
  return { state, data, volumes, director, commands, takeover, production, versions, exporting };
}
