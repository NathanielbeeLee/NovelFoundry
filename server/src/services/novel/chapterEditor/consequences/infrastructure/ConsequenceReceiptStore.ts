import { randomUUID } from "node:crypto";
import { AppError } from "../../../../../middleware/errorHandler";

interface ReceiptEntry { binding: string; preparedIdentity: string; expiresAt: number; }
/** Advisory receipts live on one worker for 15 minutes; restart/eviction requires reassessment. */
export class ConsequenceReceiptStore {
  private readonly entries = new Map<string, ReceiptEntry>();
  constructor(private readonly now: () => number = Date.now) {}
  issue(binding: string, preparedIdentity: string): { receipt: string; expiresAt: string } {
    for (const [id, entry] of this.entries) if (entry.expiresAt <= this.now()) this.entries.delete(id);
    while (this.entries.size >= 40) this.entries.delete(this.entries.keys().next().value!);
    const receipt = randomUUID();
    const expiresAt = this.now() + 15 * 60 * 1000;
    this.entries.set(receipt, { binding, preparedIdentity, expiresAt });
    return { receipt, expiresAt: new Date(expiresAt).toISOString() };
  }
  verify(receipt: string, binding: string, preparedIdentity?: string | null): ReceiptEntry {
    const entry = this.entries.get(receipt);
    if (!entry || entry.expiresAt <= this.now()) {
      throw new AppError("评估凭证已过期或服务已重启，请保留候选并重新评估。", 409);
    }
    if (entry.binding !== binding || (preparedIdentity !== undefined && entry.preparedIdentity !== preparedIdentity)) {
      throw new AppError("正文、候选、后续计划或模型配置已变化，请重新评估。", 409);
    }
    return { ...entry };
  }
  consume(receipt: string): void { this.entries.delete(receipt); }
}
