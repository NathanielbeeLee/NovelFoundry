import type { ApiResponse } from "@novelfoundry/shared/types/api";
import type { LLMProvider } from "@novelfoundry/shared/types/llm";
import { apiClient } from "./client";

export async function generateNovelChapterSummary(
  id: string,
  chapterId: string,
  payload?: {
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
  },
) {
  const { data } = await apiClient.post<
    ApiResponse<{
      chapterId: string;
      summary: string;
      expectation: string;
    }>
  >(`/novels/${id}/chapters/${chapterId}/summary/generate`, payload ?? {});
  return data;
}
