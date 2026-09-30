import type { ApiResponse } from "@novelfoundry/shared/types/api";
import type { WholeBookReviewReport, WholeBookReviewStatus } from "@novelfoundry/shared/types/wholeBookReview";
import { apiClient } from "../client";

export async function listWholeBookReviews(novelId: string) {
  const { data } = await apiClient.get<ApiResponse<WholeBookReviewReport[]>>(`/novels/${novelId}/whole-book-reviews`);
  return data;
}
export async function runWholeBookReview(novelId: string, range: { startOrder: number; endOrder: number }) {
  const { data } = await apiClient.post<ApiResponse<WholeBookReviewReport>>(`/novels/${novelId}/whole-book-reviews`, range, {
    timeout: 15 * 60 * 1000,
    silentErrorStatuses: [409],
  });
  return data;
}
export async function getWholeBookReviewStatus(novelId: string, range: { startOrder: number; endOrder: number }) {
  const { data } = await apiClient.get<ApiResponse<WholeBookReviewStatus>>(`/novels/${novelId}/whole-book-reviews/status`, {
    params: range,
  });
  return data;
}
export async function applyWholeBookReviewFeedback(novelId: string, reportId: string, issueIds?: string[]) {
  const { data } = await apiClient.post<ApiResponse<{ applied: number }>>(`/novels/${novelId}/whole-book-reviews/${reportId}/feedback`, { issueIds });
  return data;
}
