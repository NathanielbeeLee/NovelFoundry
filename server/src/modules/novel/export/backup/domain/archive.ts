import { createHash } from "node:crypto";
import { AppError } from "../../../../../middleware/errorHandler";

export const FORMAT = "ai-novel-book-backup";
export const FORMAT_VERSION = 1;
export const MAX_BYTES = 128 * 1024 * 1024;
export const MAX_RESOURCE_BYTES = 16 * 1024 * 1024;
export const MAX_TOTAL_RESOURCE_BYTES = 64 * 1024 * 1024;
export const MAX_ROWS = 100_000;
export type BackupRow = Record<string, string | number | boolean | null> & { id: string };
export type BackupTables = Record<string, BackupRow[]>;
export interface BackupResource {
  assetId: string;
  mimeType: string;
  bytes: number;
  digest: string;
  base64: string;
}
export interface NovelBackupArchive {
  format: typeof FORMAT;
  formatVersion: number;
  createdAt: string;
  novelId: string;
  tables: BackupTables;
  resources: BackupResource[];
  manifest: {
    entityCounts: Record<string, number>;
    exclusions: string[];
    warnings: string[];
  };
}
export const EXCLUSIONS = [
  "全局密钥、连接配置、模型配置和全局偏好不在单书备份范围内。",
  "导演执行图、运行任务、费用账单、恢复检查点、审批及聊天执行历史不恢复；短篇意图和图片仅保留不可执行的出处记录。",
  "检索索引、视觉投影和章节同步缓存不携带，可由正常使用流程重建。",
  "全局世界素材库、写法模板、全局写作规则和未被本书引用的共享资料不携带；作品已保存的内容保留。",
  "独立剧本、漫画和其他小说不携带；母书或衍生关系解除，作品自身保存的来源内容保留。",
  "导入的共享资料为独立副本；世界与角色库自动同步关闭，润色历史仅供阅读。",
];
export function invalid(message: string): never {
  throw new AppError(`小说备份校验失败：${message}`, 400);
}
export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}
export function canonicalJson(value: unknown, depth = 0): string {
  if (depth > 64) invalid("嵌套层级过深。");
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) invalid("含有不可序列化的数据。");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry, depth + 1)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key], depth + 1)}`).join(",")}}`;
}
export function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${label}必须是对象。`);
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some((key) => ["__proto__", "constructor", "prototype"].includes(key))) invalid(`${label}包含非法字段。`);
  return result;
}
export function exactKeys(value: Record<string, unknown>, keys: string[], label: string): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) invalid(`${label}包含未知字段。`);
}
export function entityCounts(tables: BackupTables): Record<string, number> {
  return Object.fromEntries(Object.entries(tables).sort(([a], [b]) => a.localeCompare(b)).map(([name, rows]) => [name, rows.length]));
}
