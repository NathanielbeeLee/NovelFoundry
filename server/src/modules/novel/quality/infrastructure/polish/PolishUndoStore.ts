import { polishRelations } from "../../domain/polish/PolishRelations";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../../../db/prisma";
import { snapshotPolishImage } from "./PolishPersistence";
import { AppError } from "../../../../../middleware/errorHandler";
import { polishEntities, decodeRow, rowJson, type StoredRow, type JournalChange, type PolishEntity } from "../../domain/polish/PolishJournal";

type Db = Record<string, any>;
export function undoConflict(code: string): never { throw new AppError("正文或相关记录已有后续修改，无法安全撤销。请查看润色前后差异。", 409, { code }); }
export const captureComplete = (raw: string | null) => { try { return JSON.parse(raw ?? "{}").captureComplete === true; } catch { return false; } };
export async function hasActivePolishWork(novelId: string, client: Db = prisma as unknown as Db): Promise<boolean> {
  return Boolean(await client.generationJob.findFirst({ where: { novelId, status: { in: ["queued", "running"] } }, select: { id: true } })
    || await client.novelWorkflowTask.findFirst({ where: { novelId, lane: "auto_director", status: { in: ["queued", "running"] } }, select: { id: true } })
    || await client.chapter.findFirst({ where: { novelId, chapterStatus: "generating" }, select: { id: true } })
    || await client.chapterArtifactSyncCheckpoint.findFirst({ where: { novelId, status: "running" }, select: { id: true } }));
}
export async function journalMatchesCurrent(changes: JournalChange[], client: Db = prisma as unknown as Db): Promise<boolean> {
  const latest = new Map<string, JournalChange>();
  for (const change of changes) latest.set(`${change.entityType}:${change.entityId}`, change);
  for (const change of latest.values()) {
    if (!polishEntities.includes(change.entityType as PolishEntity)) return false;
    const row = await client[change.entityType].findUnique({ where: { id: change.entityId } });
    if ((row ? rowJson(row) : null) !== change.afterJson) return false;
  }
  return true;
}

async function forbidInboundReferences(tx: Db, entity: string, row: StoredRow): Promise<void> {
  for (const relation of polishRelations().filter((relation) => relation.target === entity)) {
    const where = Object.fromEntries(relation.fields.map((field, index) => [field, row[relation.references[index]]]));
    if (await tx[relation.owner].count({ where })) undoConflict("derived_state_changed");
  }
  // These persisted references deliberately have no database FK.
  const softReferences = [
    { entity: "stateChangeProposal", field: "sourceSnapshotId", target: "storyStateSnapshot" },
    { entity: "openConflict", field: "sourceIssueId", target: "auditIssue" },
  ];
  for (const ref of softReferences.filter((ref) => ref.target === entity)) {
    if (await tx[ref.entity].count({ where: { [ref.field]: row.id } })) undoConflict("derived_state_changed");
  }
  for (const model of Prisma.dmmf.datamodel.models.filter((model) => model.fields.some((field) => field.name === "sourceRefId"))) {
    const delegate = model.name[0].toLowerCase() + model.name.slice(1);
    if (await tx[delegate].count({ where: { sourceRefId: row.id } })) undoConflict("derived_state_changed");
  }
  const jsonReferences: Record<string, Array<[string, string]>> = {
    auditIssue: [["storyPlan", "sourceIssueIdsJson"]],
    storyTimelineEvent: [["storyTimelineEvent", "prerequisiteIdsJson"], ["storyTimelineEvent", "consequenceIdsJson"], ["chapterTimeAnchor", "startsAfterIdsJson"], ["chapterTimeAnchor", "plannedEventIdsJson"], ["chapterTimeAnchor", "endedWithIdsJson"], ["chapterTimeAnchor", "forbiddenEventIdsJson"], ["timelineHook", "relatedEventIdsJson"], ["timelineConstraint", "relatedEventIdsJson"]],
    timelineHook: [["chapterTimeAnchor", "previousHookIdsJson"], ["chapterTimeAnchor", "nextHookIdsJson"], ["timelineConstraint", "relatedHookIdsJson"]],
  };
  for (const [owner, field] of jsonReferences[entity] ?? []) {
    const rows = await tx[owner].findMany({ where: { novelId: row.novelId } });
    for (const item of rows) {
      let refs: unknown; try { refs = JSON.parse(item[field] ?? "[]"); } catch { undoConflict("derived_state_changed"); }
      if (Array.isArray(refs) && refs.includes(row.id)) undoConflict("derived_state_changed");
    }
  }
}

const ragOwner = (entity: string): string | null => ({ chapter: "chapter", chapterSummary: "chapter_summary", character: "character", consistencyFact: "consistency_fact", characterTimeline: "character_timeline" }[entity] ?? null);

export async function undoJournal(input: { novelId: string; revisionId: string; expectedAfterHash: string; backup: unknown }): Promise<{ chapterId: string; status: "undone"; artifactRefreshStatus: "queued" }> {
  return prisma.$transaction(async (rawTx) => {
    const tx = rawTx as unknown as Db;
    if (await hasActivePolishWork(input.novelId, tx)) undoConflict("active_task");
    const revision = await tx.chapterPolishRevision.findFirst({ where: { id: input.revisionId, novelId: input.novelId }, include: { mutations: { orderBy: { sequence: "asc" } } } });
    if (!revision || !captureComplete(revision.afterChapterStateJson)) undoConflict("incomplete_revision");
    if (revision.status === "undone") return { chapterId: revision.chapterId, status: "undone", artifactRefreshStatus: "queued" };
    if (revision.afterRawHash !== input.expectedAfterHash || !["applied", "failed"].includes(revision.status)) undoConflict("content_changed");
    const chapter = await tx.chapter.findFirst({ where: { id: revision.chapterId, novelId: input.novelId } });
    if (!chapter || chapter.content !== revision.afterContent) undoConflict("content_changed");
    const lock = await tx.chapter.updateMany({ where: { id: chapter.id, content: chapter.content, updatedAt: chapter.updatedAt }, data: { updatedAt: chapter.updatedAt } });
    if (lock.count !== 1) undoConflict("content_changed");
    const changes = revision.mutations as JournalChange[];
    const expectedImage = await snapshotPolishImage(tx, input.novelId);
    const owners = new Map<string, { ownerType: string; ownerId: string }>();
    owners.set(`novel:${input.novelId}`, { ownerType: "novel", ownerId: input.novelId });
    for (const change of changes) {
      const ownerType = ragOwner(change.entityType); if (!ownerType) continue;
      const row = JSON.parse(change.afterJson ?? change.beforeJson ?? "{}");
      const ownerId = ownerType === "chapter_summary" ? row.chapterId : change.entityId;
      owners.set(`${ownerType}:${ownerId}`, { ownerType, ownerId });
    }
    const ownerPredicates = [...owners.values()];
    const jobs = await tx.ragIndexJob.findMany({ where: { OR: ownerPredicates, status: { in: ["queued", "running"] } } });
    if (jobs.some((job: { status: string }) => job.status === "running")) undoConflict("active_task");
    for (const job of jobs) {
      const cancelled = await tx.ragIndexJob.updateMany({ where: { id: job.id, status: "queued", updatedAt: job.updatedAt }, data: { status: "cancelled" } });
      if (cancelled.count !== 1) undoConflict("active_task");
    }
    for (const change of [...changes].reverse()) {
      if (!polishEntities.includes(change.entityType as PolishEntity)) undoConflict("incomplete_revision");
      const delegate = tx[change.entityType];
      const current = await delegate.findUnique({ where: { id: change.entityId } });
      if ((current ? rowJson(current) : null) !== change.afterJson) undoConflict("derived_state_changed");
      const entityRows = expectedImage.get(change.entityType)!;
      if (change.beforeJson === null) entityRows.delete(change.entityId);
      else entityRows.set(change.entityId, decodeRow(change.entityType, change.beforeJson));
      if (change.beforeJson === null) {
        await forbidInboundReferences(tx, change.entityType, current);
        const removed = await delegate.deleteMany({ where: current });
        if (removed.count !== 1) undoConflict("derived_state_changed");
      } else {
        const before = decodeRow(change.entityType, change.beforeJson);
        if (current) {
          const restored = await delegate.updateMany({ where: current, data: before });
          if (restored.count !== 1) undoConflict("derived_state_changed");
        } else await delegate.create({ data: before });
      }
    }
    const restoredImage = await snapshotPolishImage(tx, input.novelId);
    for (const entity of polishEntities) {
      const expected = expectedImage.get(entity)!; const actual = restoredImage.get(entity)!;
      if (expected.size !== actual.size || [...expected].some(([id, row]) => !actual.has(id) || rowJson(row) !== rowJson(actual.get(id)!))) undoConflict("derived_state_changed");
    }
    // Local metadata is the read authority. Old remote vectors become unobservable immediately.
    await tx.knowledgeChunk.deleteMany({ where: { OR: ownerPredicates } });
    for (const owner of ownerPredicates) await tx.ragIndexJob.create({ data: { ...owner, tenantId: "default", jobType: "upsert" } });
    await tx.chapterPolishRevision.update({ where: { id: revision.id }, data: { status: "undone", undoneAt: new Date(), backupVerified: true, afterChapterStateJson: JSON.stringify({ version: 1, captureComplete: true, backup: input.backup }) } });
    return { chapterId: revision.chapterId, status: "undone", artifactRefreshStatus: "queued" };
  }, { isolationLevel: "Serializable", timeout: 30000 });
}
