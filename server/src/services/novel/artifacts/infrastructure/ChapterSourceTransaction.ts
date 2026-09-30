import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma } from "@prisma/client";
import { polishPrisma as prisma } from "../../../../modules/novel/quality/polishPersistence";
import { withSqliteRetry } from "../../../../db/sqliteRetry";
import { buildContentHash } from "../domain/ChapterSourceIdentity";

export interface ChapterSourceIdentity {
  novelId: string;
  chapterId: string;
  contentHash: string;
  signal?: AbortSignal;
  dependencies?: Array<{ chapterId: string; contentHash: string }>;
}
interface ArtifactTransactionContext {
  tx: Prisma.TransactionClient;
  source: ChapterSourceIdentity;
}
const context = new AsyncLocalStorage<ArtifactTransactionContext>();

export class StaleChapterSourceError extends Error {
  constructor(readonly chapterId: string) {
    super("章节正文已更新，丢弃旧正文的派生结果。");
    this.name = "StaleChapterSourceError";
  }
}
export function currentChapterSource(): ChapterSourceIdentity | undefined {
  return context.getStore()?.source;
}

/** Only opted-in artifact persistence imports this proxy. The global client is never patched. */
export const artifactPrisma: typeof prisma = new Proxy(prisma, {
  get(target, property) {
    const active = context.getStore();
    if (!active) {
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    }
    if (property === "$transaction") {
      return async (operation: unknown) => {
        if (typeof operation !== "function") {
          throw new Error("Artifact persistence requires callback transactions; array transactions cannot be nested.");
        }
        // Join the locked transaction. No nested commit/savepoint is implied.
        return operation(active.tx);
      };
    }
    const value = Reflect.get(active.tx, property, active.tx);
    return typeof value === "function" ? value.bind(active.tx) : value;
  },
});

/** AI/network preparation must finish before entering this database-only scope. */
export async function runWithChapterSource<T>(source: ChapterSourceIdentity, persist: () => Promise<T>): Promise<T> {
  const active = context.getStore();
  if (active) {
    if (active.source.novelId !== source.novelId || active.source.chapterId !== source.chapterId
      || active.source.contentHash !== source.contentHash) {
      throw new Error("Cannot join an artifact transaction for a different chapter source.");
    }
    source.signal?.throwIfAborted();
    const result = await persist();
    source.signal?.throwIfAborted();
    return result;
  }
  source.signal?.throwIfAborted();
  return withSqliteRetry(() => prisma.$transaction(async (tx) => {
    source.signal?.throwIfAborted();
    const sources = new Map((source.dependencies ?? []).map((item) => [item.chapterId, item.contentHash]));
    sources.set(source.chapterId, source.contentHash);
    for (const [chapterId, expectedHash] of [...sources].sort(([a], [b]) => a.localeCompare(b))) {
      const chapter = await tx.chapter.findFirst({
        where: { id: chapterId, novelId: source.novelId },
        select: { content: true, updatedAt: true },
      });
      if (!chapter || buildContentHash(chapter.content ?? "") !== expectedHash) {
        throw new StaleChapterSourceError(chapterId);
      }
      // Conditional no-op write holds PG row / SQLite write locks through commit.
      // updatedAt in both predicate and data avoids reverting a concurrent metadata edit.
      const locked = await tx.chapter.updateMany({
        where: { id: chapterId, novelId: source.novelId, content: chapter.content, updatedAt: chapter.updatedAt },
        data: { updatedAt: chapter.updatedAt },
      });
      if (locked.count !== 1) throw new StaleChapterSourceError(chapterId);
    }
    source.signal?.throwIfAborted();
    const result = await context.run({ tx, source }, persist);
    source.signal?.throwIfAborted();
    return result;
  }, { timeout: 30000 }), { label: "chapter.artifacts.commit" });
}
