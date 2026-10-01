import { prisma } from "../../../../db/prisma";
import { NovelCoreService } from "../../NovelCoreService";
import { NovelApplicationContext } from "./NovelApplicationContext";
import { toNovelSnapshotListItem } from "./projections/snapshots";

export class NovelProjectApplication extends NovelApplicationContext {
  listNovels(...args: Parameters<NovelCoreService["listNovels"]>) {
    return this.core.listNovels(...args);
  }

  createNovel(...args: Parameters<NovelCoreService["createNovel"]>) {
    return this.core.createNovel(...args);
  }

  async getNovelById(id: string) {
    const novel = await this.core.getNovelById(id);
    if (!novel) {
      return null;
    }
    const volumeWorkspace = await this.volumeService.getVolumes(id).catch(() => null);
    if (!volumeWorkspace) {
      return novel;
    }
    return {
      ...novel,
      volumes: volumeWorkspace.volumes,
      volumeSource: volumeWorkspace.source,
      activeVolumeVersionId: volumeWorkspace.activeVersionId,
    };
  }

  updateNovel(...args: Parameters<NovelCoreService["updateNovel"]>) {
    return this.core.updateNovel(...args);
  }

  deleteNovel(...args: Parameters<NovelCoreService["deleteNovel"]>) {
    return this.core.deleteNovel(...args);
  }

  listChapters(...args: Parameters<NovelCoreService["listChapters"]>) {
    return this.core.listChapters(...args);
  }

  createChapter(...args: Parameters<NovelCoreService["createChapter"]>) {
    return this.core.createChapter(...args);
  }

  updateChapter(...args: Parameters<NovelCoreService["updateChapter"]>) {
    return this.core.updateChapter(...args);
  }

  deleteChapter(...args: Parameters<NovelCoreService["deleteChapter"]>) {
    return this.core.deleteChapter(...args);
  }

  async createNovelSnapshot(novelId: string, triggerType: "manual" | "auto_milestone" | "before_pipeline", label?: string) {
    const snapshot = await this.core.createNovelSnapshot(novelId, triggerType, label);
    const volumeWorkspace = await this.volumeService.getVolumes(novelId).catch(() => null);
    if (!volumeWorkspace) {
      return toNovelSnapshotListItem(snapshot);
    }
    const payload = JSON.parse(snapshot.snapshotData) as Record<string, unknown>;
    const updatedSnapshot = await prisma.novelSnapshot.update({
      where: { id: snapshot.id },
      data: {
        snapshotData: JSON.stringify({
          ...payload,
          volumes: volumeWorkspace.volumes,
          activeVolumeVersionId: volumeWorkspace.activeVersionId,
        }),
      },
    });
    return toNovelSnapshotListItem(updatedSnapshot);
  }

  listNovelSnapshots(...args: Parameters<NovelCoreService["listNovelSnapshots"]>) {
    return this.core.listNovelSnapshots(...args);
  }

  async restoreFromSnapshot(novelId: string, snapshotId: string) {
    const snapshot = await prisma.novelSnapshot.findFirst({
      where: { id: snapshotId, novelId },
    });
    if (!snapshot) {
      throw new Error("Snapshot not found.");
    }
    const data = JSON.parse(snapshot.snapshotData) as {
      outline?: string | null;
      structuredOutline?: string | null;
      chapters?: Array<{ id: string; title?: string; order?: number; content?: string | null }>;
      volumes?: unknown;
    };
    await this.createNovelSnapshot(novelId, "manual", `before-restore-${snapshotId.slice(0, 8)}`);
    await prisma.novel.update({
      where: { id: novelId },
      data: {
        outline: data.outline ?? undefined,
        structuredOutline: data.structuredOutline ?? undefined,
      },
    });
    if (Array.isArray(data.chapters) && data.chapters.length > 0) {
      for (const chapter of data.chapters) {
        if (!chapter.id) {
          continue;
        }
        await prisma.chapter.updateMany({
          where: { id: chapter.id, novelId },
          data: {
            ...(chapter.title != null ? { title: chapter.title } : {}),
            ...(chapter.order != null ? { order: chapter.order } : {}),
            ...(chapter.content != null ? { content: chapter.content } : {}),
          },
        });
      }
    }
    if (Array.isArray(data.volumes) && data.volumes.length > 0) {
      await this.volumeService.updateVolumes(novelId, { volumes: data.volumes });
    } else {
      await this.volumeService.migrateLegacyVolumes(novelId);
    }
    return this.getNovelById(novelId);
  }
}
