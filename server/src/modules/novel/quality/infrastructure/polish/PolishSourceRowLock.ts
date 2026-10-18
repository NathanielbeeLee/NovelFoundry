import type { Prisma } from "@prisma/client";

type ProjectionModel = "chapter" | "chapterSummary" | "characterTimeline" | "consistencyFact";
const guardedClients = new WeakMap<object, {
  client: Prisma.TransactionClient;
  assertOwned: (novelId: string) => void;
}>();

/** Internal registration only; callers never receive the underlying transaction. */
export function registerPolishSourceLockClient(
  guarded: object, client: Prisma.TransactionClient, assertOwned: (novelId: string) => void,
): void {
  guardedClients.set(guarded, { client, assertOwned });
}

/** Fixed no-op locks preserve date storage and do not grant raw SQL access. */
export async function lockProjectionSourceRow(
  transaction: Prisma.TransactionClient, model: ProjectionModel, id: string, novelId: string,
): Promise<number> {
  const guarded = guardedClients.get(transaction);
  guarded?.assertOwned(novelId);
  const tx = guarded?.client ?? transaction;
  switch (model) {
    case "chapter":
      return tx.$executeRaw`UPDATE "Chapter" SET "id" = "id" WHERE "id" = ${id} AND "novelId" = ${novelId}`;
    case "chapterSummary":
      return tx.$executeRaw`UPDATE "ChapterSummary" SET "id" = "id" WHERE "chapterId" = ${id} AND "novelId" = ${novelId}`;
    case "characterTimeline":
      return tx.$executeRaw`UPDATE "CharacterTimeline" SET "id" = "id" WHERE "id" = ${id} AND "novelId" = ${novelId}`;
    case "consistencyFact":
      return tx.$executeRaw`UPDATE "ConsistencyFact" SET "id" = "id" WHERE "id" = ${id} AND "novelId" = ${novelId}`;
    default:
      throw new Error("Unsupported chapter projection lock model.");
  }
}
