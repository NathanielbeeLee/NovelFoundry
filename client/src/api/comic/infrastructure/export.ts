import type { ApiResponse } from "@novelfoundry/shared/types/api";
import { apiClient } from "../../client";
import type { ExportEpisodePayload, ComicExportJob } from "../contracts/core";

// ─── Export ───────────────────────────────────────────────────────────────────

export async function exportComicEpisode(
  episodeId: string,
  payload?: ExportEpisodePayload,
): Promise<{ jobId: string; artifacts: Array<{ index?: number; url: string; width: number; height: number }> }> {
  const res = await apiClient.post(`/comic/episodes/${episodeId}/export`, payload ?? {});
  return (res.data as ApiResponse<unknown>).data as ReturnType<typeof exportComicEpisode> extends Promise<infer T> ? T : never;
}

export async function listExportJobs(projectId: string): Promise<ComicExportJob[]> {
  const res = await apiClient.get<ApiResponse<ComicExportJob[]>>(`/comic/projects/${projectId}/export-jobs`);
  return res.data.data!;
}
