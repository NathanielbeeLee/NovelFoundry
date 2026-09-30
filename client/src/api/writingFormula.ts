import type { ApiResponse } from "@novelfoundry/shared/types/api";
import type { WritingFormula } from "@novelfoundry/shared/types/writingFormula";
import { apiClient } from "./client";

export async function getWritingFormulas() {
  const { data } = await apiClient.get<ApiResponse<WritingFormula[]>>("/writing-formula");
  return data;
}

export async function getWritingFormulaDetail(id: string) {
  const { data } = await apiClient.get<ApiResponse<WritingFormula>>(`/writing-formula/${id}`);
  return data;
}

export async function deleteWritingFormula(id: string) {
  const { data } = await apiClient.delete<ApiResponse<null>>(`/writing-formula/${id}`);
  return data;
}
