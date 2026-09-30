import { AsyncLocalStorage } from "node:async_hooks";
import { prisma } from "../../../../../db/prisma";
import { polishEntities, novelScope, diffImages, rawContentHash, modelFor, type JournalImage, type PolishEntity, type StoredRow } from "../../domain/polish/PolishJournal";

type Db = Record<string, any>;
export interface PolishScope {
  revisionId: string; novelId: string; chapterId: string; expectedContent: string; nextSequence: number;
  closed: boolean; failure?: string;
}
const scope = new AsyncLocalStorage<PolishScope>();
const transaction = new AsyncLocalStorage<Db>();
const audits = new Set(["generationJob", "directorEvent", "directorRuntimeEvent", "directorLlmUsageRecord", "agentRun", "agentStep", "novelSideEffectJob", "ragIndexJob", "ragRetrievalTrace"]);
const writes = new Set(["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"]);
export const currentPolishScope = () => scope.getStore();
export const runInPolishScope = <T>(value: PolishScope, run: () => Promise<T>) => scope.run(value, run);

export async function snapshotPolishImage(tx: Db, novelId: string): Promise<JournalImage> {
  const result: JournalImage = new Map();
  // One Serializable database snapshot: concurrent authors' changes cannot be attributed to this operation.
  for (const entity of polishEntities) {
    const rows = await tx[entity].findMany({ where: novelScope(entity, novelId) }) as StoredRow[];
    result.set(entity, new Map(rows.map((row) => [row.id, row])));
  }
  return result;
}

async function assertOwnedWrite(client: Db, entity: string, input: Db): Promise<void> {
  const active = scope.getStore()!;
  const fields = new Set(modelFor(entity)?.fields.map((field) => field.name));
  const normalizeWhere = (where: Db): Db => Object.fromEntries(Object.entries(where).flatMap(([key, value]) =>
    !fields.has(key) && !["AND", "OR", "NOT"].includes(key) && value && typeof value === "object" && !Array.isArray(value)
      ? Object.entries(value) : [[key, value]]));
  if (input.where) {
    const targeted = await client[entity].findMany({ where: normalizeWhere(input.where), select: { id: true } });
    if (targeted.length) {
      const owned = await client[entity].findMany({ where: { AND: [novelScope(entity, active.novelId), { id: { in: targeted.map((row: StoredRow) => row.id) } }] }, select: { id: true } });
      if (targeted.length !== owned.length) throw new Error("润色写入目标不属于当前小说。");
    }
  }
  const parent = entity === "chapterPlanScene" ? { key: "planId", model: "storyPlan" }
    : entity === "auditIssue" ? { key: "reportId", model: "auditReport" }
    : ["characterState", "relationState", "informationState", "foreshadowState"].includes(entity) ? { key: "snapshotId", model: "storyStateSnapshot" } : null;
  for (const raw of [input.data, input.create, input.update]) {
    for (const data of Array.isArray(raw) ? raw : raw ? [raw] : []) {
      if (data.novelId !== undefined && data.novelId !== active.novelId) throw new Error("润色写入目标不属于当前小说。");
      if (parent && data[parent.key] !== undefined && !await client[parent.model].findFirst({ where: { id: data[parent.key], novelId: active.novelId }, select: { id: true } })) throw new Error("润色写入目标不属于当前小说。");
    }
  }
}

function guardClient(client: Db): Db {
  return new Proxy(client, { get(target, property) {
    if (property === "$transaction") return async (operation: unknown) => {
      if (typeof operation !== "function") throw new Error("Polish journal requires callback transactions.");
      return operation(guardClient(target));
    };
    const value = Reflect.get(target, property, target);
    if (typeof property === "string" && property.startsWith("$")) {
      const message = `Polish journal does not allow raw client operation ${property}.`;
      const active = scope.getStore(); if (active) active.failure = message;
      throw new Error(message);
    }
    if (!value || typeof value !== "object") return typeof value === "function" ? value.bind(target) : value;
    return new Proxy(value, { get(delegate, method) {
      const operation = Reflect.get(delegate, method, delegate);
      if (typeof operation !== "function") return operation;
      return async (...args: unknown[]) => {
        if (writes.has(String(method)) && !polishEntities.includes(String(property) as PolishEntity) && !audits.has(String(property))) {
          const message = `Polish journal has no persistence owner for ${String(property)}.${String(method)}.`;
          const active = scope.getStore(); if (active) active.failure = message;
          throw new Error(message);
        }
        if (writes.has(String(method)) && polishEntities.includes(String(property) as PolishEntity)) {
          await assertOwnedWrite(target, String(property), args[0] as Db);
          for (const field of modelFor(String(property))?.fields ?? []) {
            if (field.kind !== "object") continue;
            const target = field.type[0].toLowerCase() + field.type.slice(1);
            const input = args[0] as { data?: Record<string, unknown>; create?: Record<string, unknown>; update?: Record<string, unknown> };
            if ([input?.data, input?.create, input?.update].some((data) => data && field.name in data)
              && !polishEntities.includes(target as PolishEntity)) {
              const message = `Polish journal cannot capture nested ${String(property)}.${field.name}.`;
              const active = scope.getStore(); if (active) active.failure = message;
              throw new Error(message);
            }
          }
        }
        return operation.apply(delegate, args);
      };
    } });
  } });
}

async function withJournal<T>(run: (tx: Db) => Promise<T>, options?: Record<string, unknown>): Promise<T> {
  const active = scope.getStore();
  if (!active) return run(prisma as unknown as Db);
  if (active.closed) throw new Error("Polish revision is sealed; delayed writes cannot be recorded.");
  const existing = transaction.getStore();
  if (existing) return run(existing);
  let committedContent = active.expectedContent;
  let result: T;
  try { result = await prisma.$transaction(async (rawTx) => {
    const tx = rawTx as unknown as Db;
    const revision = await tx.chapterPolishRevision.findFirst({ where: { id: active.revisionId, status: "recording" } });
    if (!revision) throw new Error("Polish revision is no longer recording.");
    const chapter = await tx.chapter.findFirst({ where: { id: active.chapterId, novelId: active.novelId } });
    if (!chapter || chapter.content !== active.expectedContent) throw new Error("章节正文已被修改，停止应用本次润色。");
    const locked = await tx.chapter.updateMany({ where: { id: chapter.id, content: chapter.content, updatedAt: chapter.updatedAt }, data: { updatedAt: chapter.updatedAt } });
    if (locked.count !== 1) throw new Error("章节正文已被修改，停止应用本次润色。");
    const before = await snapshotPolishImage(tx, active.novelId);
    const guarded = guardClient(tx);
    const value = await transaction.run(guarded, () => run(guarded));
    const after = await snapshotPolishImage(tx, active.novelId);
    const changes = diffImages(before, after);
    for (const change of changes) {
      await tx.chapterPolishMutation.create({ data: { ...change, revisionId: active.revisionId, sequence: active.nextSequence++, beforeHash: change.beforeJson ? rawContentHash(change.beforeJson) : null, afterHash: change.afterJson ? rawContentHash(change.afterJson) : null } });
    }
    committedContent = String(after.get("chapter")?.get(active.chapterId)?.content ?? "");
    await tx.chapterPolishRevision.update({ where: { id: active.revisionId }, data: { afterContent: committedContent, afterRawHash: rawContentHash(committedContent) } });
    return value;
  }, { ...options, isolationLevel: "Serializable", timeout: 30000 });
  } catch (error) {
    active.failure = error instanceof Error ? error.message : String(error);
    throw error;
  }
  active.expectedContent = committedContent;
  return result;
}

/** Explicit opt-in client; never replaces or modifies the shared/global Prisma client. */
export const polishPrisma: typeof prisma = new Proxy(prisma, { get(target, property) {
  if (!scope.getStore()) { const value = Reflect.get(target, property, target); return typeof value === "function" ? value.bind(target) : value; }
  if (property === "$transaction") return async (operation: unknown, options?: Record<string, unknown>) => {
    if (typeof operation !== "function") throw new Error("Polish journal requires callback transactions.");
    return withJournal((tx) => operation(tx), options);
  };
  if (typeof property === "string" && property.startsWith("$")) {
    const message = `Polish journal does not allow raw client operation ${property}.`;
    scope.getStore()!.failure = message;
    throw new Error(message);
  }
  const current = transaction.getStore();
  if (current) return Reflect.get(current, property);
  const value = Reflect.get(target, property, target);
  if (!value || typeof value !== "object") return typeof value === "function" ? value.bind(target) : value;
  return new Proxy(value, { get(delegate, method) {
    const operation = Reflect.get(delegate, method, delegate);
    if (typeof operation !== "function") return operation;
    if (!writes.has(String(method))) return operation.bind(delegate);
    return (...args: unknown[]) => withJournal((tx) => tx[String(property)][String(method)](...args));
  } });
} });
