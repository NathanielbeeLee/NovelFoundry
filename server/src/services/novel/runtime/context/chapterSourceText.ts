import { prisma } from "../../../../db/prisma";

export const runtimeChapterSelect = {
  id: true,
  title: true,
  order: true,
  content: true,
  expectation: true,
  targetWordCount: true,
  conflictLevel: true,
  revealLevel: true,
  mustAvoid: true,
  taskSheet: true,
  sceneCards: true,
  hook: true,
} as const;

export function extractChapterOpening(content: string, maxLength: number): string {
  return content.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function extractChapterTail(content: string | null | undefined, maxLength = 520): string {
  const normalized = (content ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.slice(Math.max(0, normalized.length - maxLength));
}

const OPENING_COMPARE_LIMIT = 3;
const OPENING_SLICE_LENGTH = 220;

export async function buildOpeningConstraintHint(novelId: string, chapterOrder: number): Promise<string> {
  const recentChapters = await prisma.chapter.findMany({
    where: {
      novelId,
      order: { lt: chapterOrder },
      content: { not: null },
    },
    orderBy: { order: "desc" },
    take: OPENING_COMPARE_LIMIT,
    select: { order: true, title: true, content: true },
  });

  const openingList = recentChapters
    .map((item) => ({
      order: item.order,
      title: item.title,
      opening: extractChapterOpening(item.content ?? "", OPENING_SLICE_LENGTH),
    }))
    .filter((item) => item.opening.length > 0);

  if (openingList.length === 0) {
    return "Recent openings: none.";
  }

  return [
    "Recent openings (do not reuse the same opening structure or sentence starter):",
    ...openingList.map((item) => `- Chapter ${item.order} ${item.title}: ${item.opening}`),
  ].join("\n");
}
