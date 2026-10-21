import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { VolumePlan, VolumePlanDocument } from "@novelfoundry/shared/types/novel";
import { AppError } from "../../../../../../middleware/errorHandler";
import { mapVolumeRow, type DbClient } from "../../../volumeModels";
import { buildFallbackVolumesFromLegacy, volumeDocumentInputSchema } from "../../../volumePlanUtils";
import { buildVolumeWorkspaceDocument, normalizeVolumeWorkspaceDocument } from "../../../volumeWorkspaceDocument";
import { syncArcCompatibility } from "../../infrastructure/VolumeArcCompatibility";
import { toVolumePlanData, toVolumeChapterPlanData } from "../../infrastructure/VolumeWorkspaceRowMapping";
import { readLegacyVolumeSource } from "../../infrastructure/LegacyVolumeSourceQuery";
import {
  appendRouteCandidates, assertRouteIdentities, overlaySavedRouteRows,
  type RouteWindowAppendOptions, type RouteWindowSnapshot,
} from "../domain/RouteWindowPolicy";

interface RouteWindowRepositoryDeps {
  db: DbClient;
  transaction: <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
  ensureVersion: (tx: Prisma.TransactionClient, novelId: string, document: VolumePlanDocument) => Promise<{ versionId: string }>;
}

function readSavedDocument(novelId: string, contentJson: string | null, rows: VolumePlan[]): VolumePlanDocument {
  let document = buildVolumeWorkspaceDocument({ novelId, volumes: [] });
  if (contentJson != null) {
    let raw: VolumePlanDocument;
    try {
      raw = JSON.parse(contentJson);
      if (!raw || typeof raw !== "object" || !Array.isArray(raw.volumes)) throw new Error("invalid document");
      volumeDocumentInputSchema.parse({ volumes: raw.volumes });
      // Read normalization supplies compatibility defaults; saved fields themselves stay authoritative.
      const compatible = normalizeVolumeWorkspaceDocument(novelId, raw);
      document = { ...compatible, ...raw, novelId: raw.novelId ?? novelId,
        beatSheets: raw.beatSheets ?? compatible.beatSheets,
        volumes: compatible.volumes.map(volume => {
          const saved = raw.volumes.find(item => item.id === volume.id)!;
          return { ...volume, ...saved, novelId: saved.novelId ?? novelId,
            chapters: volume.chapters.map(chapter => ({ ...chapter, ...saved.chapters.find(item => item.id === chapter.id) })) };
        }) };
      // Check raw positions, including duplicates that draft normalization would otherwise hide.
      assertRouteIdentities({ ...document, volumes: raw.volumes.map(volume => ({ ...volume, novelId: volume.novelId ?? novelId })) }, novelId);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("已保存的分卷规划无法安全读取，请核对版本记录后继续补齐路线。", 409);
    }
  }
  return overlaySavedRouteRows(document, rows);
}

/** Read-only planning snapshots and a single append transaction; no model call or manual edit semantics. */
export class RouteWindowRepository {
  constructor(private readonly deps: RouteWindowRepositoryDeps) {}

  private async load(novelId: string, db: DbClient) {
    const version = await db.volumePlanVersion.findFirst({ where: { novelId, status: "active" }, orderBy: { version: "desc" } });
    const volumeRows = await db.volumePlan.findMany({
      where: { novelId }, include: { chapters: { orderBy: { chapterOrder: "asc" } } }, orderBy: { sortOrder: "asc" },
    });
    const rows = volumeRows.map(mapVolumeRow);
    let document = readSavedDocument(novelId, version?.contentJson ?? null, rows);
    let legacyRevision: string | null = null;
    if (!version && !rows.length) {
      const legacy = await readLegacyVolumeSource(db, novelId);
      if (legacy.outline?.trim() || legacy.structuredOutline?.trim() || legacy.chapters.length || legacy.arcPlans.length) {
        legacyRevision = JSON.stringify(legacy);
        const prefix = createHash("sha256").update(JSON.stringify([novelId, legacyRevision])).digest("hex").slice(0, 24);
        try {
          const volumes = buildFallbackVolumesFromLegacy(novelId, legacy).map(volume => {
            const id = `legacy-route-${prefix}-v${volume.sortOrder}`;
            return { ...volume, id, chapters: volume.chapters.map(plan => ({
              ...plan, id: `legacy-route-${prefix}-p${plan.chapterOrder}`, volumeId: id,
              chapterId: plan.chapterId ?? legacy.chapters.find(row => row.order === plan.chapterOrder)?.id ?? null,
            })) };
          });
          document = buildVolumeWorkspaceDocument({ novelId, volumes, source: "legacy" });
        } catch {
          throw new AppError("旧版规划缺少可用的章节信息，请核对已保存的大纲后继续。", 409);
        }
      }
    }
    document.activeVersionId = version?.id ?? null;
    if (!legacyRevision) document.source = document.volumes.length ? "volume" : "empty";
    const revision = createHash("sha256").update(JSON.stringify([version?.id, version?.contentJson, version?.updatedAt, rows, legacyRevision])).digest("hex");
    return { snapshot: { document, revision }, version, rows };
  }

  async read(novelId: string): Promise<RouteWindowSnapshot> {
    return (await this.load(novelId, this.deps.db)).snapshot;
  }

  async append(
    novelId: string,
    generated: VolumePlanDocument,
    expected: RouteWindowSnapshot,
    options: RouteWindowAppendOptions = {},
  ): Promise<RouteWindowSnapshot> {
    assertRouteIdentities(expected.document, novelId);
    if (options.endOrder != null && (!Number.isSafeInteger(options.endOrder) || options.endOrder < 1)) {
      throw new AppError("全书目标章数无效，请核对小说规划。", 400);
    }
    return this.deps.transaction(async tx => {
      // All route appenders serialize even when the book has no active version yet.
      const locked = await tx.novel.updateMany({ where: { id: novelId }, data: { id: novelId } });
      if (locked.count !== 1) throw new AppError("小说不存在。", 404);
      const current = await this.load(novelId, tx);
      const next = appendRouteCandidates(current.snapshot.document, generated, options);
      const changed = JSON.stringify(next) !== JSON.stringify(current.snapshot.document);
      if (current.snapshot.revision !== expected.revision && changed) {
        throw new AppError("分卷规划在补齐路线期间有新修改，请从保存进度重试。", 409);
      }
      if (current.version) {
        const claimed = await tx.volumePlanVersion.updateMany({
          where: { id: current.version.id, novelId, status: "active", contentJson: current.version.contentJson },
          data: { updatedAt: current.version.updatedAt },
        });
        if (claimed.count !== 1) throw new AppError("分卷规划版本已变化，请从保存进度重试。", 409);
      }
      const executions = await tx.chapter.findMany({ where: { novelId }, select: { id: true, order: true } });
      const byOrder = new Map(executions.map(row => [row.order, row]));
      if (byOrder.size !== executions.length) throw new AppError("小说存在重复章序，请先核对已保存正文。", 409);
      let linksChanged = false;
      for (const volume of next.volumes) for (const plan of volume.chapters) {
        if (options.endOrder != null && plan.chapterOrder > options.endOrder) continue;
        let execution = byOrder.get(plan.chapterOrder);
        if (execution && plan.chapterId && execution.id !== plan.chapterId) {
          throw new AppError("章节规划与已保存正文关联不一致，请核对后继续。", 409);
        }
        if (!execution) {
          if (plan.chapterId && await tx.chapter.findUnique({ where: { id: plan.chapterId }, select: { id: true } })) {
            throw new AppError("章节规划关联了其他正文位置，请核对后继续。", 409);
          }
          execution = await tx.chapter.create({ data: {
            ...(plan.chapterId ? { id: plan.chapterId } : {}), novelId, order: plan.chapterOrder,
            title: plan.title, content: "", expectation: plan.summary, targetWordCount: plan.targetWordCount,
            conflictLevel: plan.conflictLevel, revealLevel: plan.revealLevel, mustAvoid: plan.mustAvoid,
            taskSheet: plan.taskSheet, sceneCards: plan.sceneCards,
          }, select: { id: true, order: true } });
          byOrder.set(execution.order, execution);
        }
        if (plan.chapterId !== execution.id) { plan.chapterId = execution.id; linksChanged = true; }
      }
      const existingVolumes = new Map(current.rows.map(volume => [volume.id, volume]));
      const missingRows = next.volumes.some(volume => !existingVolumes.has(volume.id)
        || volume.chapters.some(plan => !existingVolumes.get(volume.id)!.chapters.some(row => row.id === plan.id)));
      if (!changed && !linksChanged && !missingRows) return current.snapshot;
      const { versionId } = await this.deps.ensureVersion(tx, novelId, next);
      next.activeVersionId = versionId; next.source = "volume";
      for (const volume of next.volumes) {
        const existing = existingVolumes.get(volume.id);
        if (!existing) await tx.volumePlan.create({ data: toVolumePlanData(novelId, volume, versionId) });
        for (const plan of volume.chapters) {
          const row = existing?.chapters.find(item => item.id === plan.id);
          if (!row) await tx.volumeChapterPlan.create({ data: toVolumeChapterPlanData(volume.id, plan) });
          else if (row.chapterId !== plan.chapterId) {
            await tx.volumeChapterPlan.update({ where: { id: row.id }, data: { chapterId: plan.chapterId } });
          }
        }
      }
      await tx.novel.update({ where: { id: novelId }, data: {
        outline: next.derivedOutline, structuredOutline: next.derivedStructuredOutline,
        ...(next.volumes.length ? { outlineStatus: "in_progress", storylineStatus: "in_progress" } : {}),
      } });
      // Legacy arc consumers receive new entries; existing author/compatibility records stay intact.
      await syncArcCompatibility(tx, novelId, next.volumes, { createOnly: true });
      return (await this.load(novelId, tx)).snapshot;
    });
  }
}
