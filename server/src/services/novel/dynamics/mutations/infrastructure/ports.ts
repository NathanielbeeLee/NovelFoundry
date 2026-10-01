import { NovelContextService } from "../../../NovelContextService";

import { NovelVolumeService } from "../../../volume/NovelVolumeService";

export type NovelContextCharacterPort = Pick<NovelContextService, "createCharacter">;

export type NovelContextServiceFactory = () => NovelContextCharacterPort;

export type VolumeWorkspacePort = Pick<NovelVolumeService, "getVolumes">;

export type VolumeWorkspaceServiceFactory = () => VolumeWorkspacePort;

export function createNovelContextService(): NovelContextCharacterPort {
  return new NovelContextService();
}

export function createVolumeWorkspaceService(): VolumeWorkspacePort {
  return new NovelVolumeService();
}
