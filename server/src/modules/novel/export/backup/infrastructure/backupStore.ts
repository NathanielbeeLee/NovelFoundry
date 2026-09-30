import fs from "node:fs";
import path from "node:path";
import { resolveServerRoot } from "../../../../../runtime/appPaths";
import { Prisma } from "@prisma/client";
import { BACKUP_MODELS, KNOWN_SCHEMA_MODELS, SCHEMA_SIGNATURE } from "../domain/catalog";
import { type BackupRow, type BackupTables, invalid, MAX_ROWS, sha256 } from "../domain/archive";
import { CHILD_EDGES, references, SHELL_MODELS, verifyClosure } from "../domain/ownership";
import { portableRow, referencedImageIds } from "../domain/portability";

// This adapter accepts only the compile-time whitelist and constructs every where/select itself.
// No uploaded table, predicate, include, relation operation or raw SQL can reach Prisma.
export type BackupTransaction = Record<string, any>;
export function modelDelegate(tx: BackupTransaction, name: string): any {
  if (!Object.prototype.hasOwnProperty.call(BACKUP_MODELS, name)) invalid("不允许访问此资产类型。");
  const delegate = tx[name[0].toLowerCase() + name.slice(1)];
  if (!delegate?.findMany || !delegate?.create) invalid(`当前数据库不支持${name}，请完成应用数据库升级。`);
  return delegate;
}
export function assertCatalogCurrent(): void {
  const names = Prisma.dmmf.datamodel.models.map((model) => model.name).sort();
  if (names.join("|") !== KNOWN_SCHEMA_MODELS.join("|")) invalid("数据库新增或移除了资产类型，请先更新备份范围说明。");
  const schema = fs.readFileSync(path.join(resolveServerRoot(), "src", "prisma", "schema.prisma"), "utf8");
  const modelBodies = [...schema.matchAll(/model (\w+) \{([\s\S]*?)\n\}/g)].map((match) => [match[1], match[2].replace(/\/\/[^\n]*/g, "").replace(/\s+/g, " ").trim()]);
  if (sha256(JSON.stringify(modelBodies)) !== SCHEMA_SIGNATURE) invalid("数据库字段、关联或约束发生变化，请重新审阅并生成备份目录。");
  for (const [name, model] of Object.entries(BACKUP_MODELS)) {
    const actual = Prisma.dmmf.datamodel.models.find((entry) => entry.name === name);
    const fields = actual?.fields.filter((field) => field.kind !== "object").map((field) => field.name).sort();
    if (!fields || fields.join("|") !== Object.keys(model.fields).sort().join("|") || actual?.fields.some((field) => field.kind !== "object" && model.fields[field.name]?.type !== field.type)) invalid(`备份规则与${name}结构不一致，请更新备份目录后再试。`);
  }
}
function select(name: string): Record<string, true> {
  return Object.fromEntries(Object.keys(BACKUP_MODELS[name].fields).map((field) => [field, true]));
}
function plainRow(source: Record<string, unknown>): BackupRow {
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value])) as BackupRow;
}
export async function readBookSnapshot(tx: BackupTransaction, novelId: string): Promise<{ tables: BackupTables; warnings: Set<string> }> {
  const tables: BackupTables = {};
  const warnings = new Set<string>();
  const queried = new Set<string>();
  const indexed = new Set<string>();
  let total = 0;
  async function collect(model: string, where: Record<string, unknown>): Promise<void> {
    const query = `${model}:${JSON.stringify(where)}`;
    if (queried.has(query)) return;
    queried.add(query);
    const rows = await modelDelegate(tx, model).findMany({ where, select: select(model), take: MAX_ROWS + 1, orderBy: { id: "asc" } });
    for (const raw of rows) {
      const row = portableRow(model, plainRow(raw), warnings);
      const key = `${model}:${row.id}`;
      if (indexed.has(key)) continue;
      if (++total > MAX_ROWS) invalid("作品资产超过100000条上限。");
      indexed.add(key); (tables[model] ??= []).push(row);
    }
  }
  async function collectIds(model: string, field: string, ids: string[]): Promise<void> {
    const unique = [...new Set(ids)].sort();
    for (let offset = 0; offset < unique.length; offset += 400) await collect(model, { [field]: { in: unique.slice(offset, offset + 400) } });
  }
  await collect("Novel", { id: novelId });
  if (tables.Novel?.length !== 1) invalid("作品不存在。");
  for (const [name, model] of Object.entries(BACKUP_MODELS)) {
    if (name !== "Novel" && !SHELL_MODELS.has(name) && model.fields.novelId) await collect(name, { novelId });
  }
  await collect("CharacterConversationSession", { scopeKind: "novel", scopeId: novelId });
  await collect("StyleBinding", { targetType: "novel", targetId: novelId });
  await collect("KnowledgeBinding", { targetType: "novel", targetId: novelId });
  for (const chapter of tables.Chapter ?? []) await collect("StyleBinding", { targetType: "chapter", targetId: chapter.id });
  let previous = -1;
  while (previous !== total) {
    previous = total;
    const requests = new Map<string, string[]>();
    for (const [name, rows] of Object.entries(tables)) for (const row of rows) {
      for (const [field, target] of Object.entries(references(name, row))) {
        const id = row[field];
        if (typeof id !== "string" || !id || indexed.has(`${target}:${id}`)) continue;
        if (!BACKUP_MODELS[target]) invalid(`${name}.${field}引用了无法携带的资产。`);
        const ids = requests.get(target) ?? []; ids.push(id); requests.set(target, ids);
      }
    }
    for (const [target, ids] of requests) await collectIds(target, "id", ids);
    for (const [child, field, parent] of CHILD_EDGES) await collectIds(child, field, (tables[parent] ?? []).map((row) => row.id));
    for (const world of tables.World ?? []) await collect("KnowledgeBinding", { targetType: "world", targetId: world.id });
    await collectIds("ImageAsset", "id", [...referencedImageIds(tables)]);
  }
  verifyClosure(tables, novelId);
  return { tables, warnings };
}
export function requiredInsertOrder(tables: BackupTables): Array<[string, BackupRow]> {
  const pending = Object.entries(tables).flatMap(([model, rows]) => rows.map((row): [string, BackupRow] => [model, row]));
  const inserted = new Set<string>();
  const result: Array<[string, BackupRow]> = [];
  while (pending.length) {
    let progress = false;
    for (let index = pending.length - 1; index >= 0; index--) {
      const [model, row] = pending[index];
      const blocked = Object.entries(BACKUP_MODELS[model].refs).some(([field, target]) => {
        return !BACKUP_MODELS[model].fields[field].nullable && row[field] && !inserted.has(`${target}:${row[field]}`);
      });
      if (blocked) continue;
      result.push([model, row]); inserted.add(`${model}:${row.id}`); pending.splice(index, 1); progress = true;
    }
    if (!progress) invalid("必填资产引用形成无法恢复的循环。");
  }
  return result;
}
export async function insertBookSnapshot(tx: BackupTransaction, tables: BackupTables): Promise<void> {
  const links: Array<[string, string, Record<string, unknown>]> = [];
  for (const [model, row] of requiredInsertOrder(tables)) {
    const data: Record<string, unknown> = { ...row };
    const deferred: Record<string, unknown> = {};
    for (const [field, spec] of Object.entries(BACKUP_MODELS[model].fields)) {
      if (spec.type === "DateTime" && typeof data[field] === "string") data[field] = new Date(data[field] as string);
      if (BACKUP_MODELS[model].refs[field] && spec.nullable && data[field] != null) {
        deferred[field] = data[field]; data[field] = null;
      }
    }
    await modelDelegate(tx, model).create({ data });
    if (Object.keys(deferred).length) links.push([model, row.id, deferred]);
  }
  for (const [model, id, data] of links) await modelDelegate(tx, model).update({ where: { id }, data });
}
