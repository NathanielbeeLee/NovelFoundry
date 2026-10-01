import type { ApiResponse } from "@novelfoundry/shared/types/api";
import { apiClient } from "../../client";
import type { ComicCharacterAsset, CreateAssetPayload, UpdateAssetPayload } from "../contracts/characters";
import type { ImageGenerationPreview, ImageGenerationOverrides } from "../contracts/generation";

export async function listCharacterAssets(characterId: string): Promise<ComicCharacterAsset[]> {
  const res = await apiClient.get<ApiResponse<ComicCharacterAsset[]>>(`/comic/characters/${characterId}/assets`);
  return res.data.data!;
}

export async function listProjectCharacterAssets(projectId: string): Promise<ComicCharacterAsset[]> {
  const res = await apiClient.get<ApiResponse<ComicCharacterAsset[]>>(`/comic/projects/${projectId}/character-assets`);
  return res.data.data!;
}

export async function createCharacterAsset(payload: CreateAssetPayload): Promise<ComicCharacterAsset> {
  const res = await apiClient.post<ApiResponse<ComicCharacterAsset>>("/comic/character-assets", payload);
  return res.data.data!;
}

export async function updateCharacterAsset(assetId: string, payload: UpdateAssetPayload): Promise<ComicCharacterAsset> {
  const res = await apiClient.patch<ApiResponse<ComicCharacterAsset>>(`/comic/character-assets/${assetId}`, payload);
  return res.data.data!;
}

export async function deleteCharacterAsset(assetId: string): Promise<void> {
  await apiClient.delete(`/comic/character-assets/${assetId}`);
}

export async function prepareCharacterAssetImage(assetId: string, provider?: string): Promise<ImageGenerationPreview> {
  const res = await apiClient.post<ApiResponse<ImageGenerationPreview>>(
    `/comic/character-assets/${assetId}/prepare-image`,
    provider ? { provider } : {},
  );
  return res.data.data!;
}

export async function generateCharacterAssetImage(
  assetId: string,
  provider?: string,
  overrides?: ImageGenerationOverrides,
): Promise<ComicCharacterAsset> {
  const res = await apiClient.post<ApiResponse<ComicCharacterAsset>>(
    `/comic/character-assets/${assetId}/generate-image`,
    { provider, ...overrides },
  );
  return res.data.data!;
}

export async function uploadCharacterAssetImage(assetId: string, file: File): Promise<{ url: string }> {
  const res = await apiClient.post<ApiResponse<{ url: string }>>(
    `/comic/character-assets/${assetId}/upload-image`,
    file,
    { headers: { "Content-Type": file.type } },
  );
  return res.data.data!;
}

export function characterAssetImageUrl(assetId: string): string {
  return `/api/comic/character-assets/${assetId}/image`;
}
