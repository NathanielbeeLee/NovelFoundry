import type { ApiResponse } from "@novelfoundry/shared/types/api";
import { apiClient } from "../../client";
import type {
  GenerateCharacterSheetOptions,
  CharacterSheetData,
  CharacterExpressionData,
  VisualAnchorRewriteResult,
  UpdateVisualAnchorPayload,
} from "../contracts/characters";
import type { ImageGenerationOverrides, ImageGenerationPreview } from "../contracts/generation";
import type { ComicCharacterGender, ComicCharacter } from "../contracts/core";

export function characterSheetImageUrl(charId: string): string {
  return `/api/comic/character-images/${charId}/sheet`;
}

export function characterExpressionImageUrl(charId: string): string {
  return `/api/comic/character-images/${charId}/expressions`;
}

export function characterFaceImageUrl(charId: string): string {
  return `/api/comic/character-images/${charId}/face`;
}

export async function generateCharacterSheet(
  charId: string,
  provider?: string,
  options?: GenerateCharacterSheetOptions,
  overrides?: ImageGenerationOverrides,
): Promise<CharacterSheetData> {
  const res = await apiClient.post<ApiResponse<CharacterSheetData>>(
    `/comic/characters/${charId}/sheet/generate`,
    { ...(provider ? { provider } : {}), ...(options ?? {}), ...(overrides ?? {}) },
  );
  return res.data.data!;
}

export async function prepareCharacterSheet(
  charId: string,
  provider?: string,
  options?: GenerateCharacterSheetOptions,
): Promise<ImageGenerationPreview> {
  const res = await apiClient.post<ApiResponse<ImageGenerationPreview>>(
    `/comic/characters/${charId}/sheet/prepare`,
    { ...(provider ? { provider } : {}), ...(options ?? {}) },
  );
  return res.data.data!;
}

export async function getCharacterSheetData(charId: string): Promise<CharacterSheetData> {
  const res = await apiClient.get<ApiResponse<CharacterSheetData>>(`/comic/characters/${charId}/sheet`);
  return res.data.data!;
}

export async function prepareCharacterExpressionSheet(charId: string, provider?: string): Promise<ImageGenerationPreview> {
  const res = await apiClient.post<ApiResponse<ImageGenerationPreview>>(
    `/comic/characters/${charId}/expressions/prepare`,
    provider ? { provider } : {},
  );
  return res.data.data!;
}

export async function generateCharacterExpressionSheet(
  charId: string,
  provider?: string,
  overrides?: ImageGenerationOverrides,
): Promise<CharacterExpressionData> {
  const res = await apiClient.post<ApiResponse<CharacterExpressionData>>(
    `/comic/characters/${charId}/expressions/generate`,
    { ...(provider ? { provider } : {}), ...(overrides ?? {}) },
  );
  return res.data.data!;
}

export async function getCharacterExpressionData(charId: string): Promise<CharacterExpressionData> {
  const res = await apiClient.get<ApiResponse<CharacterExpressionData>>(`/comic/characters/${charId}/expressions`);
  return res.data.data!;
}

/** 更新角色性别（所有生图链路的 GENDER LOCK 来源） */
export async function updateCharacterGender(
  charId: string,
  gender: ComicCharacterGender,
): Promise<ComicCharacter> {
  const res = await apiClient.patch<ApiResponse<ComicCharacter>>(
    `/comic/characters/${charId}/gender`,
    { gender },
  );
  return res.data.data!;
}

export async function rewriteCharacterVisualAnchor(
  charId: string,
  payload: { userInstruction?: string; provider?: string },
): Promise<VisualAnchorRewriteResult> {
  const res = await apiClient.post<ApiResponse<VisualAnchorRewriteResult>>(
    `/comic/characters/${charId}/visual-anchor/rewrite`,
    payload,
  );
  return res.data.data!;
}

/**
 * 更新角色"外貌锚点"（生图源头）。
 * 改一次，三视图/表情稿/资产/格子图后续生成都会读新版（已有图不会自动重绘）。
 */
export async function updateCharacterVisualAnchor(
  charId: string,
  payload: UpdateVisualAnchorPayload,
): Promise<ComicCharacter> {
  const res = await apiClient.patch<ApiResponse<ComicCharacter>>(
    `/comic/characters/${charId}/visual-anchor`,
    payload,
  );
  return res.data.data!;
}
