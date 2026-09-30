/** Portable files are validated on the server; client DTOs contain no executable model/where input. */
export const NOVEL_BACKUP_MAX_BYTES = 128 * 1024 * 1024;

export interface NovelBackupPreview {
  formatVersion: number;
  title: string;
  digest: string;
  bytes: number;
  chapterCount: number;
  characterCount: number;
  resourceCount: number;
  entityCounts: Record<string, number>;
  warnings: string[];
}

export interface NovelBackupRestoreResult {
  novelId: string;
  title: string;
  warnings: string[];
}

export interface VerifiedNovelBackup {
  backupId: string;
  path: string;
  digest: string;
  bytes: number;
  schemaVersion: number;
}
