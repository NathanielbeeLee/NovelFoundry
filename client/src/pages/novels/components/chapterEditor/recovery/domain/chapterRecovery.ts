export interface ChapterRecoveryScope { novelId: string; chapterId: string }

export interface ChapterRecoveryRecord extends ChapterRecoveryScope {
  version: 1;
  id: string;
  revision: string;
  content: string;
  baseline: string | null;
  createdAt: number;
  updatedAt: number;
}

export const RECOVERY_OLD_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
export const RECOVERY_MAX_RECORDS = 50;
// localStorage uses UTF-16. Bound complete copies without truncating manuscripts.
export const RECOVERY_MAX_CHARACTERS = 2_000_000;
export const RECOVERY_PREFIX = "novelfoundry.chapter-recovery.v1.";

export function recoveryScopePrefix(scope: ChapterRecoveryScope): string {
  return `${RECOVERY_PREFIX}${encodeURIComponent(scope.novelId)}:${encodeURIComponent(scope.chapterId)}:`;
}

export function recoveryRecordKey(record: ChapterRecoveryRecord): string {
  return `${recoveryScopePrefix(record)}${record.id}:${record.revision}`;
}

export function parseRecoveryRecord(raw: string, key: string): ChapterRecoveryRecord | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const row = value as ChapterRecoveryRecord;
    if (row.version !== 1 || typeof row.novelId !== "string" || !row.novelId
      || typeof row.chapterId !== "string" || !row.chapterId
      || typeof row.id !== "string" || !row.id || typeof row.revision !== "string" || !row.revision
      || typeof row.content !== "string" || (row.baseline !== null && typeof row.baseline !== "string")
      || !Number.isSafeInteger(row.createdAt) || row.createdAt < 0
      || !Number.isSafeInteger(row.updatedAt) || row.updatedAt < row.createdAt
      || recoveryRecordKey(row) !== key) return null;
    return row;
  } catch { return null; }
}

export function recoveryIsOld(record: ChapterRecoveryRecord, now = Date.now()): boolean {
  return now - record.updatedAt >= RECOVERY_OLD_AFTER_MS;
}
