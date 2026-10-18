import type { Prisma } from "@prisma/client";

/** Called inside the prose CAS transaction; automatic rows are replaceable projections. */
export async function invalidateManualChapterProjections(
  tx: Prisma.TransactionClient,
  novelId: string,
  chapterId: string,
): Promise<void> {
  const [facts, timelines] = await Promise.all([
    tx.consistencyFact.findMany({ where: { novelId, chapterId, source: "chapter_auto_extract" }, select: { id: true } }),
    tx.characterTimeline.findMany({ where: { novelId, chapterId, source: "chapter_extract" }, select: { id: true } }),
  ]);
  // Removing local index metadata makes stale vectors unreadable immediately.
  const owners: Prisma.KnowledgeChunkWhereInput[] = [
    ...facts.map(({ id }) => ({ ownerType: "consistency_fact" as const, ownerId: id })),
    ...timelines.map(({ id }) => ({ ownerType: "character_timeline" as const, ownerId: id })),
  ];
  if (owners.length) await tx.knowledgeChunk.deleteMany({ where: { novelId, OR: owners } });
  await tx.consistencyFact.deleteMany({ where: { novelId, chapterId, source: "chapter_auto_extract" } });
  await tx.characterTimeline.deleteMany({ where: { novelId, chapterId, source: "chapter_extract" } });
  await tx.chapterSummary.updateMany({ where: { novelId, chapterId }, data: { sourceContentHash: null } });
}
