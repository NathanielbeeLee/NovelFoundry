import type { ApiResponse } from "@novelfoundry/shared/types/api";
import { apiClient } from "../../client";
import type { ComicPanel, GenerateScriptPayload, ComicEpisode, PanelImageData } from "../contracts/core";
import type { ImageGenerationPreview, ImageGenerationOverrides } from "../contracts/generation";

// ─── Panels ───────────────────────────────────────────────────────────────────

export async function listComicPanels(episodeId: string): Promise<ComicPanel[]> {
  const res = await apiClient.get<ApiResponse<ComicPanel[]>>(`/comic/episodes/${episodeId}/panels`);
  return res.data.data!;
}

export async function generateComicPanelScript(episodeId: string, payload?: GenerateScriptPayload): Promise<ComicEpisode> {
  const res = await apiClient.post<ApiResponse<ComicEpisode>>(
    `/comic/episodes/${episodeId}/generate-script`,
    payload ?? {},
  );
  return res.data.data!;
}

export async function getComicPanel(panelId: string): Promise<ComicPanel> {
  const res = await apiClient.get<ApiResponse<ComicPanel>>(`/comic/panels/${panelId}`);
  return res.data.data!;
}

export async function updatePanelVisualPrompt(panelId: string, visualPrompt: string): Promise<ComicPanel> {
  const res = await apiClient.patch<ApiResponse<ComicPanel>>(`/comic/panels/${panelId}/visual-prompt`, { visualPrompt });
  return res.data.data!;
}

// ─── Panel images ─────────────────────────────────────────────────────────────

export async function preparePanelImage(panelId: string, provider?: string): Promise<ImageGenerationPreview> {
  const res = await apiClient.post<ApiResponse<ImageGenerationPreview>>(
    `/comic/panels/${panelId}/image/prepare`,
    provider ? { provider } : {},
  );
  return res.data.data!;
}

export async function generatePanelImage(
  panelId: string,
  provider?: string,
  overrides?: ImageGenerationOverrides,
): Promise<PanelImageData> {
  const res = await apiClient.post<ApiResponse<PanelImageData>>(
    `/comic/panels/${panelId}/image/generate`,
    { ...(provider ? { provider } : {}), ...(overrides ?? {}) },
  );
  return res.data.data!;
}

export function panelImageUrl(panelId: string): string {
  return `/api/comic/panel-images/${panelId}/panel`;
}

export function panelLetteredImageUrl(panelId: string): string {
  return `/api/comic/panel-images/${panelId}/lettered`;
}

// ─── Bubble lettering ─────────────────────────────────────────────────────────

export async function letterPanel(
  panelId: string,
  opts?: { bubbleOpacity?: number; maxBubbleWidthRatio?: number },
): Promise<{ url: string; width: number; height: number }> {
  const res = await apiClient.post<ApiResponse<{ url: string; width: number; height: number }>>(
    `/comic/panels/${panelId}/letter`,
    opts ?? {},
  );
  return res.data.data!;
}
