import type { Prisma } from "@prisma/client";
import { prisma } from "../../../../../db/prisma";
import { AppError } from "../../../../../middleware/errorHandler";
import { buildContentHash } from "../../../artifacts/persistence";
import { consequenceDigest, type ConsequenceInventory, type ConsequenceReference, type ConsequenceRevisionGuard } from "../domain/consequencePolicy";

type Database = Prisma.TransactionClient;
type Versioned = { id: string; updatedAt: Date };

/** Reads only the current chapter, two planned successors and physically linked facts. */
export class ConsequenceInventoryRepository {
  async load(novelId: string, chapterId: string, db: Database = prisma): Promise<ConsequenceInventory> {
    const current = await db.chapter.findFirst({ where: { id: chapterId, novelId } });
    if (!current) throw new AppError("章节不存在。", 404);
    const next = await db.chapter.findMany({
      where: { novelId, order: { gt: current.order }, OR: [
        { storyPlans: { some: { level: "chapter" } } },
        { volumeChapterPlans: { some: {} } },
        { taskSheet: { not: null } },
      ] },
      orderBy: [{ order: "asc" }, { id: "asc" }], take: 2,
    });
    const chapters = [current, ...next];
    const chapterIds = chapters.map((chapter) => chapter.id);
    const [plans, volumePlans, snapshotCandidate, resources, payoffs] = await Promise.all([
      db.storyPlan.findMany({ where: { novelId, chapterId: { in: chapterIds }, level: "chapter" }, orderBy: { id: "asc" } }),
      db.volumeChapterPlan.findMany({ where: { chapterId: { in: chapterIds } }, orderBy: { id: "asc" } }),
      db.storyStateSnapshot.findFirst({
        where: { novelId, sourceChapter: { order: { lte: current.order } } },
        orderBy: [{ sourceChapter: { order: "desc" } }, { id: "asc" }],
        include: { sourceChapter: { select: { id: true, content: true, updatedAt: true } } },
      }),
      db.characterResourceLedgerItem.findMany({
        where: { novelId, OR: [{ introducedChapterId: { in: chapterIds } }, { lastTouchedChapterId: { in: chapterIds } }] },
        orderBy: { id: "asc" }, take: 12,
      }),
      db.payoffLedgerItem.findMany({
        where: { novelId, OR: [{ setupChapterId: { in: chapterIds } }, { payoffChapterId: { in: chapterIds } }, { lastTouchedChapterId: { in: chapterIds } }] },
        orderBy: { id: "asc" }, take: 12,
      }),
    ]);
    // Artifact hashes establish whether derived state belongs to current prose.
    // They never replace the exact UTF-8 assessment/selection freshness identity.
    const snapshot = snapshotCandidate?.sourceChapter && snapshotCandidate.sourceContentHash
      && snapshotCandidate.sourceContentHash === buildContentHash(snapshotCandidate.sourceChapter.content ?? "") ? snapshotCandidate : null;
    const snapshotSource = snapshot?.sourceChapter;
    const limitations = ["仅评估本章、最多两章既有后续计划和提供的关联资料；未提供的后文不在评估范围。"];
    if (!snapshot) limitations.push("缺少与来源正文一致的状态快照，人物与信息状态依据不完整。");
    if (resources.length || payoffs.length) limitations.push("资源与伏笔台账未提供逐条正文版本凭据，只作为待核对的历史线索。");
    const references: ConsequenceReference[] = [];
    const guards: ConsequenceRevisionGuard[] = [];
    const add = (model: ConsequenceRevisionGuard["model"], row: Versioned, label: string, text: string, chapterOrder?: number, freshness: "current" | "unverified" = "current") => {
      guards.push({ model, id: row.id, updatedAt: row.updatedAt.toISOString() });
      references.push({ refId: `${model}:${row.id}`, label, text, freshness, ...(chapterOrder === undefined ? {} : { chapterOrder }) });
    };
    for (const chapter of chapters) add("chapter", chapter, `第${chapter.order}章《${chapter.title}》`, JSON.stringify({
      title: chapter.title, expectation: chapter.expectation, taskSheet: chapter.taskSheet,
      sceneCards: chapter.sceneCards, contentExcerpt: chapter.content?.slice(0, 6000) ?? null,
    }), chapter.order);
    for (const plan of plans) add("storyPlan", plan, `章节计划：${plan.title}`, JSON.stringify(plan));
    for (const plan of volumePlans) add("volumeChapterPlan", plan, `第${plan.chapterOrder}章卷计划`, JSON.stringify(plan), plan.chapterOrder);
    if (snapshot && snapshotSource) {
      if (!chapterIds.includes(snapshotSource.id)) guards.push({ model: "chapter", id: snapshotSource.id, updatedAt: snapshotSource.updatedAt.toISOString() });
      add("storyStateSnapshot", snapshot, "已有故事状态摘要", JSON.stringify({ summary: snapshot.summary, sourceChapterId: snapshot.sourceChapterId, sourceContentHash: snapshot.sourceContentHash }));
      const participants = new Set<string>();
      for (const plan of plans) {
        try {
          const raw: unknown = JSON.parse(plan.participantsJson ?? "[]");
          if (Array.isArray(raw)) for (const id of raw) if (typeof id === "string") participants.add(id);
        } catch { /* Missing structured participants remain an explicit evidence limit. */ }
      }
      if (participants.size) {
        const states = await db.characterState.findMany({ where: { snapshotId: snapshot.id, characterId: { in: [...participants] } }, orderBy: { id: "asc" }, take: 12 });
        for (const state of states) add("characterState", state, `角色状态：${state.characterId}`, JSON.stringify(state));
      }
    }
    for (const resource of resources) add("characterResourceLedgerItem", resource, `资源历史线索（待核对）：${resource.name}`, JSON.stringify(resource), undefined, "unverified");
    for (const payoff of payoffs) add("payoffLedgerItem", payoff, `伏笔历史线索（待核对）：${payoff.title}`, JSON.stringify(payoff), undefined, "unverified");
    // Full saved prose and all queried revisions, including unseen tail bytes, bind freshness.
    const revision = consequenceDigest({ chapters, plans, volumePlans, snapshot, resources, payoffs, references, guards });
    return { savedContent: current.content, references, guards, revision, limitations };
  }

  async verifyAndLock(novelId: string, chapterId: string, expected: ConsequenceInventory, tx: Database): Promise<void> {
    const guards = expected.guards.slice().sort((a, b) => `${a.model}:${a.id}`.localeCompare(`${b.model}:${b.id}`));
    for (const guard of guards) {
      // Fixed model/table whitelist; parameters never become SQL identifiers.
      // Raw no-op locks preserve legacy SQLite integer timestamps instead of rewriting/binding ISO dates.
      let locked: number;
      switch (guard.model) {
        case "chapter": locked = await tx.$executeRaw`UPDATE "Chapter" SET "id" = "id" WHERE "id" = ${guard.id}`; break;
        case "storyPlan": locked = await tx.$executeRaw`UPDATE "StoryPlan" SET "id" = "id" WHERE "id" = ${guard.id}`; break;
        case "volumeChapterPlan": locked = await tx.$executeRaw`UPDATE "VolumeChapterPlan" SET "id" = "id" WHERE "id" = ${guard.id}`; break;
        case "storyStateSnapshot": locked = await tx.$executeRaw`UPDATE "StoryStateSnapshot" SET "id" = "id" WHERE "id" = ${guard.id}`; break;
        case "characterState": locked = await tx.$executeRaw`UPDATE "CharacterState" SET "id" = "id" WHERE "id" = ${guard.id}`; break;
        case "characterResourceLedgerItem": locked = await tx.$executeRaw`UPDATE "CharacterResourceLedgerItem" SET "id" = "id" WHERE "id" = ${guard.id}`; break;
        case "payoffLedgerItem": locked = await tx.$executeRaw`UPDATE "PayoffLedgerItem" SET "id" = "id" WHERE "id" = ${guard.id}`; break;
      }
      const delegate = tx[guard.model] as unknown as { findUnique(input: { where: { id: string }; select: { updatedAt: true } }): Promise<{ updatedAt: Date } | null> };
      const current = locked === 1 ? await delegate.findUnique({ where: { id: guard.id }, select: { updatedAt: true } }) : null;
      if (!current || current.updatedAt.getTime() !== Date.parse(guard.updatedAt)) throw new AppError("评估依据已变化，请重新评估候选的后续影响。", 409);
    }
    const latest = await this.load(novelId, chapterId, tx);
    if (latest.revision !== expected.revision) throw new AppError("评估依据已变化，请重新评估候选的后续影响。", 409);
  }
}
