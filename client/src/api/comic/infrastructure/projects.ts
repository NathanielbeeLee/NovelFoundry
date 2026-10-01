import type { ApiResponse } from "@novelfoundry/shared/types/api";
import { apiClient } from "../../client";
import type {
  ComicProject,
  CreateComicProjectPayload,
  ComicProjectDetail,
  UpdateComicPresetPayload,
} from "../contracts/core";

// ─── Projects ─────────────────────────────────────────────────────────────────

export async function listComicProjects(): Promise<ComicProject[]> {
  const res = await apiClient.get<ApiResponse<ComicProject[]>>("/comic/projects");
  return res.data.data!;
}

export async function createComicProject(payload: CreateComicProjectPayload): Promise<ComicProject> {
  const res = await apiClient.post<ApiResponse<ComicProject>>("/comic/projects", payload);
  return res.data.data!;
}

export async function getComicProject(projectId: string): Promise<ComicProjectDetail> {
  const res = await apiClient.get<ApiResponse<ComicProjectDetail>>(`/comic/projects/${projectId}`);
  return res.data.data!;
}

export async function deleteComicProject(projectId: string): Promise<void> {
  await apiClient.delete(`/comic/projects/${projectId}`);
}

export async function importComicSourceBundle(projectId: string): Promise<ComicProjectDetail> {
  const res = await apiClient.post<ApiResponse<ComicProjectDetail>>(`/comic/projects/${projectId}/source-bundle`);
  return res.data.data!;
}

export async function updateComicStyle(projectId: string, style: string): Promise<ComicProject> {
  const res = await apiClient.patch<ApiResponse<ComicProject>>(`/comic/projects/${projectId}/style`, { style });
  return res.data.data!;
}

export async function updateComicPreset(projectId: string, payload: UpdateComicPresetPayload): Promise<ComicProject> {
  const res = await apiClient.patch<ApiResponse<ComicProject>>(`/comic/projects/${projectId}/preset`, payload);
  return res.data.data!;
}
