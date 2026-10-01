import type { ApiResponse } from "@novelfoundry/shared/types/api";
import { apiClient } from "../../client";
import type { ComicEpisode, GenerateOutlinePayload, UpdateEpisodePayload } from "../contracts/core";

// ─── Episodes ─────────────────────────────────────────────────────────────────

export async function listComicEpisodes(projectId: string): Promise<ComicEpisode[]> {
  const res = await apiClient.get<ApiResponse<ComicEpisode[]>>(`/comic/projects/${projectId}/episodes`);
  return res.data.data!;
}

export async function generateComicOutline(projectId: string, payload?: GenerateOutlinePayload): Promise<ComicEpisode[]> {
  const res = await apiClient.post<ApiResponse<ComicEpisode[]>>(
    `/comic/projects/${projectId}/episodes/generate-outline`,
    payload ?? {},
  );
  return res.data.data!;
}

export async function getComicEpisode(episodeId: string): Promise<ComicEpisode> {
  const res = await apiClient.get<ApiResponse<ComicEpisode>>(`/comic/episodes/${episodeId}`);
  return res.data.data!;
}

export async function updateEpisodeSourceText(episodeId: string, sourceText: string): Promise<ComicEpisode> {
  const res = await apiClient.patch<ApiResponse<ComicEpisode>>(`/comic/episodes/${episodeId}/source-text`, { sourceText });
  return res.data.data!;
}

export async function updateComicEpisode(episodeId: string, payload: UpdateEpisodePayload): Promise<ComicEpisode> {
  const res = await apiClient.patch<ApiResponse<ComicEpisode>>(`/comic/episodes/${episodeId}`, payload);
  return res.data.data!;
}
