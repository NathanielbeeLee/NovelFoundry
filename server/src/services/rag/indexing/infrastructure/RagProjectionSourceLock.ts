import type { Prisma } from "@prisma/client";
import type { RagChunkCandidate, RagOwnerType } from "../../types";
import { lockProjectionSourceRow } from "../../../../modules/novel/quality/sourceRowLock";

/** Deleted/replaced automatic projection rows must not be resurrected by a delayed embedding. */
export async function lockRagProjectionSource(
  tx: Prisma.TransactionClient, ownerType: RagOwnerType, ownerId: string, candidates: RagChunkCandidate[],
): Promise<void> {
  if (ownerType !== "character_timeline" && ownerType !== "consistency_fact") return;
  const novelId = candidates[0]?.novelId;
  if (!novelId) throw new Error("Chapter projection indexing requires its novel identity.");
  const locked = await lockProjectionSourceRow(tx, ownerType === "character_timeline" ? "characterTimeline" : "consistencyFact", ownerId, novelId);
  if (locked !== 1) throw new Error("Chapter projection changed before index commit.");
  const row = ownerType === "character_timeline"
    ? await tx.characterTimeline.findUnique({ where: { id: ownerId } })
    : await tx.consistencyFact.findUnique({ where: { id: ownerId } });
  if (!row || candidates.some((item) => item.novelId !== row.novelId
    || JSON.parse(item.metadataJson ?? "{}").updatedAt !== row.updatedAt.toISOString())) {
    throw new Error("Chapter projection changed while its index was being prepared.");
  }
}
