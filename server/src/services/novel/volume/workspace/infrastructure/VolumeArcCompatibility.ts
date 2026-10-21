import type { Prisma } from "@prisma/client";
import type { VolumePlan } from "@novelfoundry/shared/types/novel";

export async function syncArcCompatibility(
  tx: Prisma.TransactionClient,
  novelId: string,
  volumes: VolumePlan[],
  options: { createOnly?: boolean } = {},
): Promise<void> {
  const externalRefs = volumes.map((volume) => `volume:${volume.sortOrder}`);
  if (!options.createOnly) await tx.storyPlan.deleteMany({
    where: {
      novelId,
      level: "arc",
      externalRef: {
        startsWith: "volume:",
        notIn: externalRefs,
      },
    },
  });

  for (const volume of volumes) {
    const externalRef = `volume:${volume.sortOrder}`;
    const existing = await tx.storyPlan.findFirst({
      where: { novelId, level: "arc", externalRef },
      select: { id: true },
    });
    const payload = {
      title: volume.title,
      objective: volume.mainPromise ?? volume.summary ?? `推进第${volume.sortOrder}卷主线。`,
      phaseLabel: volume.escalationMode ?? null,
      hookTarget: volume.nextVolumeHook ?? null,
      rawPlanJson: JSON.stringify({
        volumeTitle: volume.title,
        summary: volume.summary,
        openingHook: volume.openingHook,
        mainPromise: volume.mainPromise,
        primaryPressureSource: volume.primaryPressureSource,
        coreSellingPoint: volume.coreSellingPoint,
        escalationMode: volume.escalationMode,
        protagonistChange: volume.protagonistChange,
        midVolumeRisk: volume.midVolumeRisk,
        climax: volume.climax,
        payoffType: volume.payoffType,
        nextVolumeHook: volume.nextVolumeHook,
        resetPoint: volume.resetPoint,
        openPayoffs: volume.openPayoffs,
        chapters: volume.chapters.map((chapter) => ({
          chapterOrder: chapter.chapterOrder,
          beatKey: chapter.beatKey ?? null,
          title: chapter.title,
          summary: chapter.summary,
        })),
      }),
      revealsJson: volume.openPayoffs.length > 0 ? JSON.stringify(volume.openPayoffs) : null,
      mustAdvanceJson: JSON.stringify(volume.chapters.map((chapter) => `第${chapter.chapterOrder}章 ${chapter.title}`)),
      status: "active",
      externalRef,
    };
    if (existing) {
      if (options.createOnly) continue;
      await tx.storyPlan.update({
        where: { id: existing.id },
        data: payload,
      });
    } else {
      await tx.storyPlan.create({
        data: {
          novelId,
          level: "arc",
          ...payload,
        },
      });
    }
  }
}

