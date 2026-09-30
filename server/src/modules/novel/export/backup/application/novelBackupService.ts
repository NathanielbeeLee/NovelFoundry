import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { NovelBackupRestoreResult, VerifiedNovelBackup } from "@novelfoundry/shared/types/novelBackup";
import { prisma } from "../../../../../db/prisma";
import { AppError } from "../../../../../middleware/errorHandler";
import { resolveDataRoot } from "../../../../../runtime/appPaths";
import { canonicalJson, entityCounts, EXCLUSIONS, FORMAT, FORMAT_VERSION, invalid, type NovelBackupArchive, sha256 } from "../domain/archive";
import { parseNovelBackup } from "../domain/validation";
import { remapTables } from "../domain/portability";
import { assertCatalogCurrent, insertBookSnapshot, readBookSnapshot, requiredInsertOrder } from "../infrastructure/backupStore";
import { exportAssetFiles, publishAssetFiles } from "../infrastructure/assetFiles";

const TRANSACTION_OPTIONS = { isolationLevel: "Serializable" as const, maxWait: 15_000, timeout: 120_000 };
export async function exportNovelBackup(novelId: string): Promise<NovelBackupArchive> {
  assertCatalogCurrent();
  // Serializable snapshot protects all DB-backed assets against concurrent API and worker changes.
  const { tables, warnings } = await prisma.$transaction((tx) => readBookSnapshot(tx, novelId), TRANSACTION_OPTIONS);
  const resources = await exportAssetFiles(tables);
  const archive: NovelBackupArchive = {
    format: FORMAT, formatVersion: FORMAT_VERSION, createdAt: new Date().toISOString(), novelId,
    tables, resources, manifest: { entityCounts: entityCounts(tables), exclusions: [...EXCLUSIONS], warnings: [...warnings] },
  };
  parseNovelBackup(archive);
  requiredInsertOrder(tables);
  return archive;
}
export function previewNovelBackup(input: unknown) {
  const result = parseNovelBackup(input);
  requiredInsertOrder(result.archive.tables);
  return result.preview;
}
export interface RestoreNovelBackupOptions { title?: string; expectedDigest: string; requestId: string }
export async function restoreNovelBackup(input: unknown, options: RestoreNovelBackupOptions): Promise<NovelBackupRestoreResult> {
  assertCatalogCurrent();
  const { archive, preview } = parseNovelBackup(input);
  if (options.expectedDigest !== preview.digest) throw new AppError("备份内容与预检结果不一致，请重新选择文件。", 409);
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(options.requestId)) invalid("恢复请求标识无效。");
  const title = options.title?.trim() || `${preview.title}（恢复副本）`;
  if (title.length > 500) invalid("新作品标题不能超过500个字符。");
  const receipt = (prisma as any).novelBackupImportReceipt;
  if (!receipt) invalid("当前数据库尚未支持安全恢复，请先完成应用数据库升级。");
  const matchReceipt = async (found: any): Promise<NovelBackupRestoreResult | null> => {
    if (!found) return null;
    if (found.digest !== preview.digest || found.title !== title) throw new AppError("同一恢复请求不能用于不同备份或标题。", 409);
    if (!await prisma.novel.findUnique({ where: { id: found.novelId }, select: { id: true } })) throw new AppError("该恢复请求对应的作品已被移除，请重新发起恢复。", 409);
    return { novelId: found.novelId, title: found.title, warnings: preview.warnings };
  };
  const prior = await matchReceipt(await receipt.findUnique({ where: { requestId: options.requestId } }));
  if (prior) return prior;
  const restored = remapTables(archive.tables, archive.novelId, title);
  requiredInsertOrder(restored.tables);
  const files = await publishAssetFiles(archive.resources, restored.ids, restored.tables);
  try {
    await prisma.$transaction(async (tx) => {
      await insertBookSnapshot(tx, restored.tables);
      await (tx as any).novelBackupImportReceipt.create({ data: { requestId: options.requestId, novelId: restored.novelId, digest: preview.digest, title } });
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    // Inspect the durable receipt before cleaning files: an uncertain commit response may still
    // have committed this exact book. If the DB cannot answer, preserve harmless unique files.
    let found: any;
    try { found = await receipt.findUnique({ where: { requestId: options.requestId } }); }
    catch { throw error; }
    if (found?.novelId !== restored.novelId) await files.cleanup();
    const concurrent = await matchReceipt(found);
    if (concurrent) return concurrent;
    throw error;
  }
  return { novelId: restored.novelId, title, warnings: preview.warnings };
}
export async function createVerifiedNovelBackup(novelId: string, reason: string): Promise<VerifiedNovelBackup> {
  if (!reason.trim()) invalid("服务端备份必须注明用途。");
  const archive = await exportNovelBackup(novelId);
  const encoded = canonicalJson(archive);
  const backupId = randomUUID();
  const directory = path.join(resolveDataRoot(), "backups", "novels");
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, `${backupId}.json`);
  try {
    const handle = await fs.open(file, "wx", 0o600);
    try { await handle.writeFile(encoded); await handle.sync(); } finally { await handle.close(); }
    const bytes = await fs.readFile(file);
    const verified = parseNovelBackup(bytes);
    if (bytes.length !== Buffer.byteLength(encoded) || sha256(bytes) !== verified.preview.digest) invalid("服务端备份落盘核验失败。");
    return { backupId, path: file, digest: verified.preview.digest, bytes: bytes.length, schemaVersion: FORMAT_VERSION };
  } catch (error) {
    await fs.rm(file, { force: true });
    throw error;
  }
}
