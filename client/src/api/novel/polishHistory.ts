import type { ApiResponse } from "@novelfoundry/shared/types/api";
import type { PolishRevisionDetail, PolishRevisionPage } from "@novelfoundry/shared/types/polishHistory";
import { apiClient } from "../client";
export async function listPolishRevisions(novelId: string, cursor?: string) {
  const { data } = await apiClient.get<ApiResponse<PolishRevisionPage>>(`/novels/${novelId}/polish-revisions`, { params: { cursor } });
  return data.data ?? { items: [], nextCursor: null };
}
export async function getPolishRevision(novelId: string, revisionId: string) {
  const { data } = await apiClient.get<ApiResponse<PolishRevisionDetail>>(`/novels/${novelId}/polish-revisions/${revisionId}`);
  return data.data;
}
export async function undoPolishRevision(novelId: string, revisionId: string, expectedAfterHash: string) {
  const { data } = await apiClient.post<ApiResponse<{ chapterId: string; status: "undone" }>>(`/novels/${novelId}/polish-revisions/${revisionId}/undo`, { expectedAfterHash }, { timeout: 120000, silentErrorStatuses: [409] });
  return data.data;
}
