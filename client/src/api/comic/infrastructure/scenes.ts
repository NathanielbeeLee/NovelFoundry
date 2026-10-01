import type { ApiResponse } from "@novelfoundry/shared/types/api";
import { apiClient } from "../../client";
import type { ComicScene, CreateScenePayload, UpdateScenePayload } from "../contracts/scenes";
import type { ImageGenerationPreview, ImageGenerationOverrides } from "../contracts/generation";

export async function listComicScenes(projectId: string): Promise<ComicScene[]> {
  const res = await apiClient.get<ApiResponse<ComicScene[]>>(`/comic/projects/${projectId}/scenes`);
  return res.data.data!;
}

export async function createComicScene(payload: CreateScenePayload): Promise<ComicScene> {
  const res = await apiClient.post<ApiResponse<ComicScene>>("/comic/scenes", payload);
  return res.data.data!;
}

export async function updateComicScene(sceneId: string, payload: UpdateScenePayload): Promise<ComicScene> {
  const res = await apiClient.patch<ApiResponse<ComicScene>>(`/comic/scenes/${sceneId}`, payload);
  return res.data.data!;
}

export async function deleteComicScene(sceneId: string): Promise<void> {
  await apiClient.delete(`/comic/scenes/${sceneId}`);
}

export async function prepareComicSceneImage(sceneId: string, provider?: string): Promise<ImageGenerationPreview> {
  const res = await apiClient.post<ApiResponse<ImageGenerationPreview>>(
    `/comic/scenes/${sceneId}/prepare-image`,
    provider ? { provider } : {},
  );
  return res.data.data!;
}

export async function generateComicSceneImage(
  sceneId: string,
  provider?: string,
  overrides?: ImageGenerationOverrides,
): Promise<ComicScene> {
  const res = await apiClient.post<ApiResponse<ComicScene>>(
    `/comic/scenes/${sceneId}/generate-image`,
    { ...(provider ? { provider } : {}), ...(overrides ?? {}) },
  );
  return res.data.data!;
}

export async function uploadComicSceneImage(sceneId: string, file: File): Promise<{ url: string }> {
  const res = await apiClient.post<ApiResponse<{ url: string }>>(
    `/comic/scenes/${sceneId}/upload-image`,
    file,
    { headers: { "Content-Type": file.type } },
  );
  return res.data.data!;
}

export function comicSceneImageUrl(sceneId: string): string {
  return `/api/comic/scenes/${sceneId}/image`;
}
