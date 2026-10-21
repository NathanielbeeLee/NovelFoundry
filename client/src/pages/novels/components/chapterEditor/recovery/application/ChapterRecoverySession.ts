import { ChapterRecoveryStore, RecoveryStorageError } from "../infrastructure/ChapterRecoveryStore.ts";
import type { ChapterRecoveryRecord, ChapterRecoveryScope } from "../domain/chapterRecovery.ts";

export interface RecoverableDraft { content: string; savedContent: string; sourceContent: string | null }
const STORAGE_WARNING = "设备副本暂不可用。离开前请保存正文，或先复制到本地文件；编辑器中的文字会保留。";
const createRecoveryId = (): string => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Owns one editor lifetime. Async receipts never address another editor's copy. */
export class ChapterRecoverySession {
  private id: string;
  private current: ChapterRecoveryRecord | null = null;
  private error: string | null = null;
  private readonly scope: ChapterRecoveryScope;
  private readonly store: ChapterRecoveryStore;
  private readonly now: () => number;
  private readonly newId: () => string;

  constructor(
    scope: ChapterRecoveryScope,
    store = new ChapterRecoveryStore(),
    now = Date.now,
    newId: () => string = createRecoveryId,
  ) { this.scope = scope; this.store = store; this.now = now; this.newId = newId; this.id = newId(); }

  snapshot() {
    try {
      const { records, invalid } = this.store.read(this.scope);
      return {
        pending: records.filter((record) => record.id !== this.id),
        protected: records.some((record) => record.revision === this.current?.revision),
        error: this.error ?? (invalid ? "有一份设备副本无法读取，原数据保留。请先保存或复制编辑器中的正文。" : null),
      };
    } catch { return { pending: [], protected: false, error: this.error ?? STORAGE_WARNING }; }
  }

  capture(draft: RecoverableDraft): void {
    if (draft.content === draft.savedContent) return;
    try {
      if (this.current?.content === draft.content && this.current.baseline === draft.sourceContent
        && this.store.read(this.scope).records.some((record) => record.revision === this.current?.revision)) return;
      const record = this.makeRecord(draft.content, draft.sourceContent);
      this.store.write(record, this.current);
      this.current = record;
      this.error = null;
    } catch (error) { this.recordError(error); }
  }

  beginSave(draft: RecoverableDraft): ChapterRecoveryRecord | null {
    this.capture(draft);
    return this.current?.content === draft.content && this.current.baseline === draft.sourceContent ? this.current : null;
  }

  acknowledge(token: ChapterRecoveryRecord | null, submitted: string, expectedBaseline: string | null): void {
    if (!token) return;
    try {
      this.store.remove(token);
      if (this.current?.revision === token.revision) this.current = null;
      else if (this.current?.baseline === expectedBaseline) {
        // New input typed during this request survives with the acknowledged CAS baseline.
        const next = this.makeRecord(this.current.content, submitted);
        this.store.write(next, this.current);
        this.current = next;
      }
      this.error = null;
    } catch (error) { this.recordError(error); }
  }

  restore(record: ChapterRecoveryRecord): void {
    // Preserve a different dirty editor copy when the author chooses another one.
    this.id = this.newId();
    this.current = null;
    const restored = this.makeRecord(record.content, record.baseline);
    try {
      // Transfer only this immutable revision, after the complete new copy exists.
      this.store.write(restored, record);
      this.current = restored;
      this.error = null;
    } catch (error) { this.recordError(error); }
  }

  discard(record: ChapterRecoveryRecord): void {
    try { this.store.remove(record); this.error = null; }
    catch (error) { this.recordError(error); }
  }

  discardCurrent(): void {
    if (!this.current) return;
    try { this.store.remove(this.current); this.current = null; this.error = null; }
    catch (error) { this.recordError(error); }
  }

  private makeRecord(content: string, baseline: string | null): ChapterRecoveryRecord {
    const updatedAt = this.now();
    return { ...this.scope, version: 1, id: this.id, revision: this.newId(), content, baseline,
      createdAt: this.current?.createdAt ?? updatedAt, updatedAt };
  }

  private recordError(error: unknown) {
    this.error = error instanceof RecoveryStorageError ? error.message : STORAGE_WARNING;
  }
}
