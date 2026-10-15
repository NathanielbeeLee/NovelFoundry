import type { ApiResponse } from "@novelfoundry/shared/types/api";
import type { ResearchAdoptionView, ResearchSourceInput, ResearchSourceView } from "@novelfoundry/shared/types/knowledgeResearch";
import { apiClient } from "../client";
export async function getResearchSource(documentId: string) {
  return (await apiClient.get<ApiResponse<ResearchSourceView | null>>(`/knowledge/documents/${documentId}/research`)).data;
}
export async function saveResearchSource(documentId: string, input: ResearchSourceInput) {
  return (await apiClient.put<ApiResponse<ResearchSourceView>>(`/knowledge/documents/${documentId}/research`, input)).data;
}
export async function extractResearch(documentId: string, expectedRevision: string) {
  return (await apiClient.post<ApiResponse<ResearchSourceView>>(`/knowledge/documents/${documentId}/research/extract`, { expectedRevision }, { timeout: 180_000 })).data;
}
export async function setResearchAdoption(documentId: string, findingId: string, novelId: string, adopt: boolean) {
  return (await apiClient.put<ApiResponse<ResearchSourceView | null>>(`/knowledge/documents/${documentId}/research/findings/${findingId}/adoption`, { novelId, adopt })).data;
}
export async function getResearchAdoptions(novelId: string) {
  return (await apiClient.get<ApiResponse<ResearchAdoptionView[]>>("/knowledge/research/adoptions", { params: { novelId } })).data;
}
