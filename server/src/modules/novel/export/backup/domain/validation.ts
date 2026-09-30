import type { NovelBackupPreview } from "@novelfoundry/shared/types/novelBackup";
import { BACKUP_ENUMS, BACKUP_MODELS } from "./catalog";
import { canonicalJson, entityCounts, exactKeys, EXCLUSIONS, FORMAT, FORMAT_VERSION, invalid, MAX_BYTES, MAX_RESOURCE_BYTES, MAX_ROWS, MAX_TOTAL_RESOURCE_BYTES, type NovelBackupArchive, record, sha256 } from "./archive";
import { verifyClosure } from "./ownership";
import { portableRow, referencedImageIds, validateStructuredFields } from "./portability";

export function parseNovelBackup(input: unknown): { archive: NovelBackupArchive; preview: NovelBackupPreview } {
  let value = input;
  if (Buffer.isBuffer(value)) {
    if (value.length > MAX_BYTES) invalid("文件超过128MiB上限。");
    value = value.toString("utf8");
  }
  if (typeof value === "string") {
    if (Buffer.byteLength(value) > MAX_BYTES) invalid("文件超过128MiB上限。");
    try { value = JSON.parse(value); } catch { invalid("文件不是有效的JSON备份。"); }
  }
  const top = record(value, "备份");
  exactKeys(top, ["format", "formatVersion", "createdAt", "novelId", "tables", "resources", "manifest"], "备份");
  if (top.format !== FORMAT || top.formatVersion !== FORMAT_VERSION) invalid("不支持此备份格式版本。");
  if (typeof top.createdAt !== "string" || !Number.isFinite(Date.parse(top.createdAt))) invalid("创建时间无效。");
  if (typeof top.novelId !== "string" || !top.novelId || top.novelId.length > 200) invalid("作品标识无效。");
  const tables = record(top.tables, "资产表");
  const seen = new Set<string>();
  let count = 0;
  for (const [name, entries] of Object.entries(tables)) {
    const model = Object.prototype.hasOwnProperty.call(BACKUP_MODELS, name) ? BACKUP_MODELS[name] : undefined;
    if (!model || !Array.isArray(entries)) invalid(`不支持的资产类型：${name}。`);
    count += entries.length;
    if (count > MAX_ROWS) invalid("资产记录超过100000条上限。");
    for (const entry of entries) {
      const row = record(entry, name);
      exactKeys(row, Object.keys(model.fields), name);
      if (typeof row.id !== "string" || !row.id || row.id.length > 200 || seen.has(row.id)) invalid("资产标识为空、过长或重复。");
      seen.add(row.id);
      for (const [field, spec] of Object.entries(model.fields)) {
        const item = row[field];
        if (item === undefined) invalid(`${name}.${field}缺失，资产不完整。`);
        if (item === null) { if (!spec.nullable) invalid(`${name}.${field}不能为空。`); continue; }
        let valid = false;
        if (spec.type === "String") valid = typeof item === "string";
        else if (spec.type === "DateTime") valid = typeof item === "string" && /^\d{4}-\d\d-\d\dT/.test(item) && Number.isFinite(Date.parse(item));
        else if (spec.type === "Int") valid = typeof item === "number" && Number.isInteger(item) && item >= -2147483648 && item <= 2147483647;
        else if (spec.type === "Float") valid = typeof item === "number" && Number.isFinite(item);
        else if (spec.type === "Boolean") valid = typeof item === "boolean";
        else valid = typeof item === "string" && (BACKUP_ENUMS[spec.type] ?? []).includes(item);
        if (!valid) invalid(`${name}.${field}类型或取值不合法。`);
      }
    }
  }
  const archive = top as unknown as NovelBackupArchive;
  if (archive.tables.Novel?.length !== 1 || archive.tables.Novel[0].id !== archive.novelId) invalid("备份必须恰好包含一部作品。");
  const title = archive.tables.Novel[0].title;
  if (typeof title !== "string" || !title.trim() || title.length > 500) invalid("作品标题无效。");
  const manifest = record(top.manifest, "资产清单");
  exactKeys(manifest, ["entityCounts", "exclusions", "warnings"], "资产清单");
  if (canonicalJson(manifest.entityCounts) !== canonicalJson(entityCounts(archive.tables))) invalid("清单记录数与数据不符。");
  if (canonicalJson(manifest.exclusions) !== canonicalJson(EXCLUSIONS)) invalid("备份范围声明不匹配。");
  if (!Array.isArray(manifest.warnings) || manifest.warnings.length > 1000 || manifest.warnings.some((item) => typeof item !== "string" || item.length > 1000)) invalid("提示清单无效。");
  verifyClosure(archive.tables, archive.novelId);
  validateStructuredFields(archive.tables);
  for (const [model, rows] of Object.entries(archive.tables)) for (const row of rows) {
    if (canonicalJson(row) !== canonicalJson(portableRow(model, row, new Set()))) invalid(`${model}携带了运行状态或未解除的外部关系。`);
  }
  if (!Array.isArray(top.resources)) invalid("资源清单缺失。");
  for (const asset of archive.tables.ImageAsset ?? []) {
    if (asset.url !== `/api/images/assets/${asset.id}/file` || asset.metadata !== JSON.stringify({ storageDriver: "portable", assetId: asset.id })) invalid("图片包含未规范化的存储地址。");
  }
  const assets = new Set((archive.tables.ImageAsset ?? []).map((row) => row.id));
  const resources = new Set<string>();
  let total = 0;
  for (const item of top.resources) {
    const resource = record(item, "资源");
    exactKeys(resource, ["assetId", "mimeType", "bytes", "digest", "base64"], "资源");
    if (typeof resource.assetId !== "string" || !assets.has(resource.assetId) || resources.has(resource.assetId)) invalid("图片资源重复或不属于作品。");
    resources.add(resource.assetId);
    if (typeof resource.mimeType !== "string" || !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(resource.mimeType)) invalid("图片类型不受支持。");
    if (typeof resource.bytes !== "number" || !Number.isInteger(resource.bytes) || resource.bytes <= 0 || resource.bytes > MAX_RESOURCE_BYTES) invalid("单个图片超过16MiB上限或为空。");
    if (typeof resource.base64 !== "string" || resource.base64.length > Math.ceil(MAX_RESOURCE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(resource.base64)) invalid("图片编码无效。");
    const bytes = Buffer.from(resource.base64, "base64");
    if (bytes.toString("base64") !== resource.base64 || bytes.length !== resource.bytes || sha256(bytes) !== resource.digest) invalid("图片大小或校验和不符。");
    const mime = resource.mimeType;
    const signatureValid = mime === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : mime === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : mime === "image/gif" ? ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))
      : bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
    if (!signatureValid) invalid("图片内容与声明类型不符。");
    total += bytes.length;
    if (total > MAX_TOTAL_RESOURCE_BYTES) invalid("图片总量超过64MiB上限。");
  }
  if (assets.size !== resources.size) invalid("图片文件不完整。");
  for (const id of referencedImageIds(archive.tables)) if (!assets.has(id)) invalid("正文或资料引用了未携带的受管图片。");
  const encoded = canonicalJson(archive);
  const bytes = Buffer.byteLength(encoded);
  if (bytes > MAX_BYTES) invalid("文件超过128MiB上限。");
  return { archive, preview: {
    formatVersion: FORMAT_VERSION, title, digest: sha256(encoded), bytes,
    chapterCount: archive.tables.Chapter?.length ?? 0,
    characterCount: archive.tables.Character?.length ?? 0,
    resourceCount: resources.size, entityCounts: entityCounts(archive.tables),
    warnings: [...EXCLUSIONS, ...archive.manifest.warnings],
  } };
}
