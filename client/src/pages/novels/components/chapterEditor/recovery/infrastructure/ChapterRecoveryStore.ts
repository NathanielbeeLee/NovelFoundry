import {
  RECOVERY_MAX_CHARACTERS, RECOVERY_MAX_RECORDS, RECOVERY_PREFIX,
  parseRecoveryRecord, recoveryRecordKey, recoveryScopePrefix,
  type ChapterRecoveryRecord, type ChapterRecoveryScope,
} from "../domain/chapterRecovery.ts";

type RecoveryStorage = Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">;

export class RecoveryStorageError extends Error {
  readonly kind: "changed" | "capacity";
  constructor(kind: "changed" | "capacity") {
    super(kind === "capacity"
      ? "设备副本空间不足。请保存正文或先复制到本地文件，再丢弃不需要的副本。"
      : "此份设备副本被其他窗口处理，请重新核对；编辑器中的文字会保留。");
    this.kind = kind;
  }
}

/** Immutable revision keys avoid both a shared-index race and non-atomic storage CAS. */
export class ChapterRecoveryStore {
  private readonly storage: () => RecoveryStorage;
  constructor(storage: () => RecoveryStorage = () => window.localStorage) { this.storage = storage; }

  read(scope: ChapterRecoveryScope): { records: ChapterRecoveryRecord[]; invalid: boolean } {
    const storage = this.storage();
    const prefix = recoveryScopePrefix(scope);
    const records: ChapterRecoveryRecord[] = [];
    let invalid = false;
    for (const key of this.keys(storage)) {
      if (!key.startsWith(prefix)) continue;
      const raw = storage.getItem(key);
      if (raw === null) continue;
      const record = parseRecoveryRecord(raw, key);
      if (record) records.push(record);
      else invalid = true; // Keep unreadable data intact; never silently overwrite it.
    }
    return { records: records.sort((a, b) => b.updatedAt - a.updatedAt), invalid };
  }

  write(record: ChapterRecoveryRecord, previous: ChapterRecoveryRecord | null = null): void {
    const storage = this.storage();
    const key = recoveryRecordKey(record);
    const existing = storage.getItem(key);
    if (existing !== null) throw new RecoveryStorageError("changed");
    const serialized = JSON.stringify(record);
    const previousKey = previous ? recoveryRecordKey(previous) : null;
    const keys = this.keys(storage).filter((item) => item !== previousKey);
    const size = keys.reduce((total, item) => total + (storage.getItem(item)?.length ?? 0), serialized.length);
    if (keys.length >= RECOVERY_MAX_RECORDS || size > RECOVERY_MAX_CHARACTERS) throw new RecoveryStorageError("capacity");
    storage.setItem(key, serialized);
    // A new complete immutable copy exists before removing the replaced revision.
    if (previous) this.remove(previous);
  }

  remove(record: ChapterRecoveryRecord): boolean {
    const storage = this.storage();
    const key = recoveryRecordKey(record);
    const current = storage.getItem(key);
    if (current === null) return false;
    if (parseRecoveryRecord(current, key)?.revision !== record.revision) return false;
    storage.removeItem(key);
    return true;
  }

  private keys(storage: RecoveryStorage): string[] {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith(RECOVERY_PREFIX)) keys.push(key);
    }
    return keys;
  }
}
