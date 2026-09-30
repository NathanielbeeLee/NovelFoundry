import type { ApiResponse } from "@novelfoundry/shared/types/api";
import type { NovelBackupPreview, NovelBackupRestoreResult } from "@novelfoundry/shared/types/novelBackup";
import { apiClient, type ApiHttpError } from "../client";

export async function downloadNovelBackup(novelId: string): Promise<Blob> {
  try {
    const response = await apiClient.get<Blob>(`/novels/${encodeURIComponent(novelId)}/backup`, {
      responseType: "blob", timeout: 180_000, silentErrorStatuses: [400, 404, 409, 500],
    });
    return response.data;
  } catch (error) {
    const details = (error as ApiHttpError).details;
    if (details instanceof Blob) {
      let message: unknown;
      try {
        const body = JSON.parse(await details.text()) as ApiResponse<unknown>;
        message = body.error ?? body.message;
      } catch { /* Keep the normalized network/server error if no JSON message exists. */ }
      if (typeof message === "string" && message) throw new Error(message);
    }
    throw error;
  }
}

export async function previewNovelBackup(file: File): Promise<NovelBackupPreview> {
  const response = await apiClient.post<ApiResponse<NovelBackupPreview>>("/novels/backup/preview", file, {
    headers: { "Content-Type": "application/octet-stream" }, timeout: 180_000,
  });
  if (!response.data.data) throw new Error("无法读取备份文件的检查结果。");
  return response.data.data;
}

export async function restoreNovelBackup(file: File, title: string, digest: string, requestId: string): Promise<NovelBackupRestoreResult> {
  const response = await apiClient.post<ApiResponse<NovelBackupRestoreResult>>("/novels/backup/restore", file, {
    headers: { "Content-Type": "application/octet-stream" },
    params: { title, digest, requestId }, timeout: 180_000,
  });
  if (!response.data.data) throw new Error("未收到恢复结果，请刷新书架确认后再试。");
  return response.data.data;
}
