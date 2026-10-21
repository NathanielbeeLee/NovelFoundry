import type { DbClient } from "../../volumeModels";


export async function readLegacyVolumeSource(db: DbClient, novelId: string) {
  const [novel, arcPlans] = await Promise.all([
    db.novel.findUnique({
      where: { id: novelId },
      select: {
        id: true,
        outline: true,
        structuredOutline: true,
        estimatedChapterCount: true,
        chapters: {
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
        },
      },
    }),
    db.storyPlan.findMany({
      where: { novelId, level: "arc" },
      orderBy: [{ createdAt: "asc" }],
      select: {
        externalRef: true,
        title: true,
        objective: true,
        phaseLabel: true,
        hookTarget: true,
        rawPlanJson: true,
      },
    }),
  ]);
  if (!novel) {
    throw new Error("小说不存在。");
  }
  return {
    outline: novel.outline,
    structuredOutline: novel.structuredOutline,
    estimatedChapterCount: novel.estimatedChapterCount,
    chapters: novel.chapters,
    arcPlans,
  };
}
