import type { ApiResponse } from "@novelfoundry/shared/types/api";
import { apiClient } from "../../client";
import type { ComicFact } from "../contracts/core";

export async function listComicFacts(projectId: string): Promise<ComicFact[]> {
  const res = await apiClient.get<ApiResponse<ComicFact[]>>(`/comic/projects/${projectId}/facts`);
  return res.data.data!;
}

export async function deleteComicFact(factId: string): Promise<void> {
  await apiClient.delete(`/comic/facts/${factId}`);
}
