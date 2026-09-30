import { promises as fs, constants } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolveGeneratedImagesRoot } from "../../../../../runtime/appPaths";
import { parseImageAssetMetadata, resolveImageAssetFile } from "../../../../../services/image/imageAssetStorage";
import { type BackupResource, type BackupTables, invalid, MAX_RESOURCE_BYTES, MAX_TOTAL_RESOURCE_BYTES, sha256 } from "../domain/archive";

export async function exportAssetFiles(tables: BackupTables): Promise<BackupResource[]> {
  const result: BackupResource[] = [];
  let total = 0;
  for (const asset of tables.ImageAsset ?? []) {
    const metadata = parseImageAssetMetadata(String(asset.metadata ?? ""));
    let bytes: Buffer;
    try {
      if (metadata.storageDriver !== "s3" && !metadata.storageKey) {
        const original = metadata.localPath ?? (typeof asset.url === "string" && path.isAbsolute(asset.url) ? asset.url : null);
        if (!original) invalid("存在尚未保存为受管文件的图片。");
        const root = await fs.realpath(resolveGeneratedImagesRoot());
        const actual = await fs.realpath(original);
        const relative = path.relative(root, actual);
        if (relative.startsWith("..") || path.isAbsolute(relative) || actual !== path.resolve(original)) invalid("图片不在受管目录内或包含符号链接。");
        const handle = await fs.open(actual, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const info = await handle.stat();
          if (!info.isFile() || info.size <= 0 || info.size > MAX_RESOURCE_BYTES) invalid("图片为空、不是普通文件或超过16MiB。");
          bytes = await handle.readFile();
          const after = await handle.stat();
          if (after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs || after.size !== info.size || bytes.length !== info.size || bytes.length > MAX_RESOURCE_BYTES) invalid("备份时图片文件发生变化。");
        } finally { await handle.close(); }
      } else {
        // Only persisted, database-owned S3 assets enter this adapter. Uploaded package paths never do.
        const resolved = await resolveImageAssetFile({ assetId: asset.id, url: String(asset.url), metadata: String(asset.metadata ?? ""), mimeType: String(asset.mimeType ?? "") });
        if (!resolved.stream) invalid("对象存储图片不可读取。");
        const chunks: Buffer[] = []; let size = 0;
        try {
          for await (const piece of resolved.stream) {
            const chunk = Buffer.isBuffer(piece) ? piece : Buffer.from(piece);
            size += chunk.length;
            if (size > MAX_RESOURCE_BYTES) invalid("对象存储图片超过16MiB。");
            chunks.push(chunk);
          }
          bytes = Buffer.concat(chunks);
        } finally { resolved.stream.destroy(); }
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("小说备份校验失败")) throw error;
      invalid(`图片 ${asset.id} 文件缺失或无法读取，备份未完成。`);
    }
    total += bytes.length;
    if (total > MAX_TOTAL_RESOURCE_BYTES) invalid("图片总量超过64MiB。");
    const mimeType = String(asset.mimeType ?? "image/png").replace("image/jpg", "image/jpeg");
    result.push({ assetId: asset.id, mimeType, bytes: bytes.length, digest: sha256(bytes), base64: bytes.toString("base64") });
    // Do not export machine paths, bucket keys or signed source URLs.
    asset.url = `/api/images/assets/${asset.id}/file`;
    asset.metadata = JSON.stringify({ storageDriver: "portable", assetId: asset.id });
  }
  return result;
}
export interface PublishedAssets { directory: string | null; cleanup(): Promise<void> }
export async function publishAssetFiles(resources: BackupResource[], ids: Map<string, string>, tables: BackupTables): Promise<PublishedAssets> {
  if (!resources.length) return { directory: null, cleanup: async () => undefined };
  const directory = path.join(resolveGeneratedImagesRoot(), "imports", randomUUID());
  // A unique generated directory is the only cleanup target; no package path is ever used.
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const cleanup = () => fs.rm(directory, { recursive: true, force: true });
  try {
    for (const resource of resources) {
      const id = ids.get(resource.assetId)!;
      const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" }[resource.mimeType];
      const file = path.join(directory, `${id}.${extension}`);
      const handle = await fs.open(file, "wx", 0o600);
      try { await handle.writeFile(Buffer.from(resource.base64, "base64")); await handle.sync(); } finally { await handle.close(); }
      if (sha256(await fs.readFile(file)) !== resource.digest) invalid("恢复图片写入校验失败。");
      const asset = tables.ImageAsset.find((entry) => entry.id === id)!;
      asset.url = file;
      asset.metadata = JSON.stringify({ storageDriver: "local", localPath: file, relativePath: path.relative(resolveGeneratedImagesRoot(), file), sourceUrl: null });
      asset.mimeType = resource.mimeType;
    }
    return { directory, cleanup };
  } catch (error) { await cleanup(); throw error; }
}
