import type { VolumeChapterPlan, VolumePlan, VolumePlanDocument } from "@novelfoundry/shared/types/novel";

import type { Prisma } from "@prisma/client";

import { prisma } from "../../../../../db/prisma";

import { novelEventBus } from "../../../../../events";

import type { VolumeUpdateReason } from "../../../../../events";

import { logMemoryUsage } from "../../../../../runtime/memoryTelemetry";

import { payoffLedgerSyncService } from "../../../../payoff/PayoffLedgerSyncService";

import { getLegacyVolumeSource } from "../../legacyVolumeSource";

import { normalizeVolumeWorkspaceDocument, serializeVolumeWorkspaceDocument } from "../../volumeWorkspaceDocument";

import { ensureVolumeWorkspaceDocument, getActiveVersionRow, getLatestVersionRow, persistActiveVolumeWorkspace, runVolumeWorkspaceTransaction } from "../../volumeWorkspacePersistence";

import { type VolumeMemoryTelemetry } from "../../volumeGenerationTelemetry";

export class VolumeWorkspacePersistenceService {

  protected async hydrateCanonicalChapterFields(
    novelId: string,
    document: VolumePlanDocument,
  ): Promise<{ document: VolumePlanDocument; changed: boolean }> {
    const chapterRows = await prisma.chapter.findMany({
      where: { novelId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        order: true,
        title: true,
        expectation: true,
        targetWordCount: true,
        conflictLevel: true,
        revealLevel: true,
        mustAvoid: true,
        taskSheet: true,
        sceneCards: true,
      },
    });
    if (chapterRows.length === 0) {
      return { document, changed: false };
    }

    const chapterById = new Map(chapterRows.map((row) => [row.id, row] as const));
    const chapterByOrder = new Map(chapterRows.map((row) => [row.order, row] as const));
    let changed = false;
    const volumes = document.volumes.map((volume) => {
      const chapters = volume.chapters.map((chapter) => {
        const row = chapter.chapterId
          ? chapterById.get(chapter.chapterId) ?? chapterByOrder.get(chapter.chapterOrder)
          : chapterByOrder.get(chapter.chapterOrder);
        if (!row) {
          return chapter;
        }
        const conflictLevelSource: VolumeChapterPlan["conflictLevelSource"] = chapter.conflictLevelSource === "user" ? "user" : "ai";
        const nextChapter = {
          ...chapter,
          chapterId: row.id,
          chapterOrder: row.order,
          title: row.title,
          summary: row.expectation?.trim() || chapter.summary,
          targetWordCount: row.targetWordCount ?? null,
          conflictLevel: chapter.conflictLevelSource === "user"
            ? chapter.conflictLevel ?? null
            : row.conflictLevel ?? null,
          conflictLevelSource,
          revealLevel: row.revealLevel ?? null,
          mustAvoid: row.mustAvoid ?? null,
          taskSheet: row.taskSheet ?? null,
          sceneCards: row.sceneCards ?? null,
        };
        if (JSON.stringify(nextChapter) !== JSON.stringify(chapter)) {
          changed = true;
        }
        return nextChapter;
      });
      return changed ? { ...volume, chapters } : volume;
    });

    return { document: changed ? { ...document, volumes } : document, changed };
  }

  async mirrorChapterIntoWorkspace(
    novelId: string,
    chapter: {
      id?: string | null;
      order: number;
      title: string;
      expectation?: string | null;
      targetWordCount?: number | null;
      conflictLevel?: number | null;
      revealLevel?: number | null;
      mustAvoid?: string | null;
      taskSheet?: string | null;
      sceneCards?: string | null;
    },
  ): Promise<void> {
    const document = await this.ensureVolumeWorkspace(novelId);
    let changed = false;
    const nextVolumes = document.volumes.map((volume) => {
      const chapters = volume.chapters.map((item) => {
        const matchesChapter = chapter.id
          ? item.chapterId === chapter.id || item.chapterOrder === chapter.order
          : item.chapterOrder === chapter.order;
        if (!matchesChapter) {
          return item;
        }
        changed = true;
        const conflictLevelSource: VolumeChapterPlan["conflictLevelSource"] = item.conflictLevelSource === "user" ? "user" : "ai";
        return {
          ...item,
          chapterId: chapter.id ?? item.chapterId ?? null,
          chapterOrder: chapter.order,
          title: chapter.title,
          summary: chapter.expectation?.trim() || item.summary,
          targetWordCount: chapter.targetWordCount ?? null,
          conflictLevel: item.conflictLevelSource === "user"
            ? item.conflictLevel ?? null
            : chapter.conflictLevel ?? null,
          conflictLevelSource,
          revealLevel: chapter.revealLevel ?? null,
          mustAvoid: chapter.mustAvoid ?? null,
          taskSheet: chapter.taskSheet ?? null,
          sceneCards: chapter.sceneCards ?? null,
        };
      });
      return changed ? { ...volume, chapters } : volume;
    });
    if (!changed) {
      return;
    }
    await this.persistWorkspaceDocument(novelId, {
      ...document,
      volumes: nextVolumes,
    }, {
      emitEvent: false,
      syncPayoffLedger: false,
    });
  }

  protected emitVolumeUpdated(novelId: string, reason: VolumeUpdateReason): void {
    void novelEventBus.emit({
      type: "volume:updated",
      payload: { novelId, reason },
    }).catch(() => {});
  }

  protected syncPayoffLedger(novelId: string): void {
    void payoffLedgerSyncService.syncLedger(novelId).catch(() => null);
  }

  protected async persistWorkspaceDocument(
    novelId: string,
    document: VolumePlanDocument,
    options: {
      emitEvent?: boolean;
      syncPayoffLedger?: boolean;
      volumeUpdateReason?: VolumeUpdateReason;
      memoryTelemetry?: VolumeMemoryTelemetry;
    } = {},
  ): Promise<VolumePlanDocument> {
    logMemoryUsage({
      event: "before_write",
      component: "persistWorkspaceDocument",
      novelId,
      taskId: options.memoryTelemetry?.taskId,
      stage: options.memoryTelemetry?.stage ?? "volume_workspace",
      itemKey: options.memoryTelemetry?.itemKey,
      scope: options.memoryTelemetry?.scope,
      entrypoint: options.memoryTelemetry?.entrypoint,
      volumeId: options.memoryTelemetry?.volumeId,
      chapterId: options.memoryTelemetry?.chapterId,
      volumeCount: document.volumes.length,
      chapterCount: document.volumes.reduce((sum, volume) => sum + volume.chapters.length, 0),
      beatSheetCount: document.beatSheets.length,
    });
    const persistedDocument = await runVolumeWorkspaceTransaction(async (tx) => {
      const { versionId } = await this.ensureActiveVersionRecord(tx, novelId, document);
      const nextDocument = {
        ...document,
        activeVersionId: versionId,
        source: "volume" as const,
      };
      await persistActiveVolumeWorkspace(tx, novelId, nextDocument, versionId);
      return nextDocument;
    });
    logMemoryUsage({
      event: "after_write",
      component: "persistWorkspaceDocument",
      novelId,
      taskId: options.memoryTelemetry?.taskId,
      stage: options.memoryTelemetry?.stage ?? "volume_workspace",
      itemKey: options.memoryTelemetry?.itemKey,
      scope: options.memoryTelemetry?.scope,
      entrypoint: options.memoryTelemetry?.entrypoint,
      volumeId: options.memoryTelemetry?.volumeId,
      chapterId: options.memoryTelemetry?.chapterId,
      volumeCount: persistedDocument.volumes.length,
      chapterCount: persistedDocument.volumes.reduce((sum, volume) => sum + volume.chapters.length, 0),
      beatSheetCount: persistedDocument.beatSheets.length,
    });

    if (options.emitEvent !== false) {
      this.emitVolumeUpdated(novelId, options.volumeUpdateReason ?? "workspace_updated");
    }
    if (options.syncPayoffLedger !== false) {
      this.syncPayoffLedger(novelId);
    }
    return persistedDocument;
  }

  protected parseVersionDocument(novelId: string, contentJson: string): VolumePlanDocument {
    return normalizeVolumeWorkspaceDocument(novelId, contentJson, {
      source: "volume",
      activeVersionId: null,
    });
  }

  protected parseVersionContent(novelId: string, contentJson: string): VolumePlan[] {
    return this.parseVersionDocument(novelId, contentJson).volumes;
  }

  protected async ensureVolumeWorkspace(novelId: string): Promise<VolumePlanDocument> {
    const document = await ensureVolumeWorkspaceDocument({
      novelId,
      getLegacySource: () => getLegacyVolumeSource(novelId),
    });
    const hydrated = await this.hydrateCanonicalChapterFields(novelId, document);
    if (!hydrated.changed) {
      return hydrated.document;
    }
    return this.persistWorkspaceDocument(novelId, hydrated.document, {
      emitEvent: false,
      syncPayoffLedger: false,
      volumeUpdateReason: "chapter_sync",
    });
  }

  protected findVolumeChapterMatch(
    workspace: VolumePlanDocument,
    chapter: {
      order: number;
      title: string;
    },
  ): { volumeId: string; volumeChapterId: string } {
    for (const volume of workspace.volumes) {
      const matchedChapter = volume.chapters.find((item) => item.chapterOrder === chapter.order)
        ?? volume.chapters.find((item) => item.title.trim() === chapter.title.trim());
      if (matchedChapter) {
        return {
          volumeId: volume.id,
          volumeChapterId: matchedChapter.id,
        };
      }
    }
    throw new Error("当前章节未映射到卷规划章节，无法生成执行合同。");
  }

  protected async ensureActiveVersionRecord(
    tx: Prisma.TransactionClient,
    novelId: string,
    document: VolumePlanDocument,
    diffSummary?: string,
  ): Promise<{ versionId: string; version: number }> {
    const activeVersion = await getActiveVersionRow(novelId, tx);
    if (activeVersion) {
      const persistedDocument = {
        ...document,
        activeVersionId: activeVersion.id,
        source: "volume" as const,
      };
      const updated = await tx.volumePlanVersion.update({
        where: { id: activeVersion.id },
        data: {
          contentJson: serializeVolumeWorkspaceDocument(persistedDocument),
          diffSummary: diffSummary ?? activeVersion.diffSummary,
        },
      });
      return {
        versionId: updated.id,
        version: updated.version,
      };
    }

    const latestVersion = await getLatestVersionRow(novelId, tx);
    const created = await tx.volumePlanVersion.create({
      data: {
        novelId,
        version: (latestVersion?.version ?? 0) + 1,
        status: "active",
        contentJson: "{}",
        diffSummary: diffSummary ?? "同步当前卷工作区。",
      },
    });
    const persistedDocument = {
      ...document,
      activeVersionId: created.id,
      source: "volume" as const,
    };
    await tx.volumePlanVersion.update({
      where: { id: created.id },
      data: {
        contentJson: serializeVolumeWorkspaceDocument(persistedDocument),
      },
    });
    return {
      versionId: created.id,
      version: created.version,
    };
  }
}
