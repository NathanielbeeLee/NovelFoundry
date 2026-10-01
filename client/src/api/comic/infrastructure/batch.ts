import type { ApiResponse } from "@novelfoundry/shared/types/api";
import { apiClient } from "../../client";
import type { StartBatchPayload, BatchCostEstimate } from "../contracts/generation";
import type { ComicBatchJob } from "../contracts/core";

export async function startEpisodeBatch(
  episodeId: string,
  payload?: StartBatchPayload,
): Promise<{ jobId: string }> {
  const res = await apiClient.post<ApiResponse<{ jobId: string }>>(
    `/comic/episodes/${episodeId}/batch/start`,
    payload ?? {},
  );
  return res.data.data!;
}

export async function retryBatchJob(jobId: string, provider?: string): Promise<{ jobId: string }> {
  const res = await apiClient.post<ApiResponse<{ jobId: string }>>(
    `/comic/batch-jobs/${jobId}/retry`,
    provider ? { provider } : {},
  );
  return res.data.data!;
}

export async function getBatchJob(jobId: string): Promise<ComicBatchJob> {
  const res = await apiClient.get<ApiResponse<ComicBatchJob>>(`/comic/batch-jobs/${jobId}`);
  return res.data.data!;
}

export async function listBatchJobs(projectId: string): Promise<ComicBatchJob[]> {
  const res = await apiClient.get<ApiResponse<ComicBatchJob[]>>(`/comic/projects/${projectId}/batch-jobs`);
  return res.data.data!;
}

export async function estimateBatchCost(episodeId: string, provider?: string): Promise<BatchCostEstimate> {
  const params = provider ? `?provider=${encodeURIComponent(provider)}` : "";
  const res = await apiClient.get<ApiResponse<BatchCostEstimate>>(
    `/comic/episodes/${episodeId}/batch/estimate${params}`,
  );
  return res.data.data!;
}
