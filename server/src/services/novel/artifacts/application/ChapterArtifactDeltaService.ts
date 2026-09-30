import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";
import { chapterArtifactDeltaPrompt } from "../../../../prompting/prompts/novel/chapterArtifactDelta.prompts";
import { ragServices } from "../../../rag";
import type { RagOwnerType } from "../../../rag/types";
import { stateService } from "../../../state/StateService";
import { characterMindService } from "../../characterMind/CharacterMindService";
import { characterResourceLedgerService } from "../../characterResource/CharacterResourceLedgerService";
import { characterResourceStaleScanService } from "../../characterResource/CharacterResourceStaleScanService";
import { compactText } from "../../characterResource/characterResourceShared";
import { stateCommitService } from "../../state/StateCommitService";
import { normalizeContentProvenance } from "../../state/stateProposalSourceQuality";
import { artifactPrisma as prisma, runWithChapterSource } from "../infrastructure/ChapterSourceTransaction";

import {
  ARTIFACT_DELTA_SOURCE_STAGE,
  ARTIFACT_DELTA_SOURCE_TYPE,
  ChapterArtifactDeltaSyncInput,
  ChapterArtifactDeltaSyncResult,
  CharacterLookupItem,
  compactPromptText,
  stringifyActiveCharacterDialogueInfluenceText,
  stringifyChapterResourceText,
  stringifyPayoffText,
  stringifyPreviousState,
} from "../domain/ChapterArtifactMapping";
import { buildContentHash } from "../domain/ChapterSourceIdentity";
import { ChapterArtifactStore } from "../infrastructure/ChapterArtifactStore";
import { ChapterCharacterArtifactStore } from "../infrastructure/ChapterCharacterArtifactStore";

export class ChapterArtifactDeltaService {
  private readonly store = new ChapterArtifactStore();
  private readonly characters = new ChapterCharacterArtifactStore();

  async syncChapterArtifacts(input: ChapterArtifactDeltaSyncInput): Promise<ChapterArtifactDeltaSyncResult> {
    const content = compactText(input.content);
    if (!content) {
      throw new Error("章节正文为空，无法提取资产 delta。");
    }

    const [novel, chapter, chapters, characters, existingResources, payoffRows] = await Promise.all([
      prisma.novel.findUnique({
        where: { id: input.novelId },
        select: { title: true },
      }),
      prisma.chapter.findFirst({
        where: { id: input.chapterId, novelId: input.novelId },
        select: { id: true, order: true, title: true, expectation: true, taskSheet: true },
      }),
      prisma.chapter.findMany({
        where: { novelId: input.novelId },
        select: { id: true, order: true, title: true, content: true },
        orderBy: { order: "asc" },
      }),
      prisma.character.findMany({
        where: { novelId: input.novelId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          role: true,
          castRole: true,
          currentGoal: true,
          currentState: true,
        },
      }),
      characterResourceLedgerService.listResources(input.novelId).catch(() => []),
      prisma.payoffLedgerItem.findMany({
        where: { novelId: input.novelId },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        select: {
          ledgerKey: true,
          title: true,
          currentStatus: true,
          summary: true,
          targetStartChapterOrder: true,
          targetEndChapterOrder: true,
          lastTouchedChapterOrder: true,
        },
        take: 30,
      }),
    ]);

    if (!novel || !chapter) {
      throw new Error("小说或章节不存在，无法提取资产 delta。");
    }

    const activeCharacterDialogueInfluences = await this.characters.listActiveCharacterDialogueInfluences({
      novelId: input.novelId,
      chapterOrder: chapter.order,
    }).catch(() => []);

    const previousSnapshot = await stateService.getLatestSnapshotBeforeChapter(input.novelId, chapter.order);
    const contentHash = buildContentHash(content);
    const result = await runStructuredPrompt({
      asset: chapterArtifactDeltaPrompt,
      promptInput: {
        novelTitle: novel.title,
        chapterOrder: chapter.order,
        chapterTitle: chapter.title,
        chapterGoal: compactPromptText(
          chapter.taskSheet?.trim() || chapter.expectation?.trim() || "无明确章节目标",
          2400,
        ),
        characterRosterText: this.buildCharacterRosterText(characters),
        previousStateText: stringifyPreviousState(previousSnapshot),
        existingResourceText: stringifyChapterResourceText(existingResources),
        existingPayoffText: stringifyPayoffText(payoffRows),
        activeCharacterDialogueInfluenceText: stringifyActiveCharacterDialogueInfluenceText(activeCharacterDialogueInfluences),
        chapterContent: content,
      },
      options: {
        provider: input.provider,
        model: input.model,
        temperature: Math.min(input.temperature ?? 0.2, 0.4),
        novelId: input.novelId,
        chapterId: input.chapterId,
        stage: "chapter_artifact_delta",
        maxTokens: 4000,
        signal: input.signal,
      },
    });

    const output = result.output;
    const sourceType = input.sourceType?.trim() || ARTIFACT_DELTA_SOURCE_TYPE;
    const sourceStage = input.sourceStage ?? ARTIFACT_DELTA_SOURCE_STAGE;
    const sourceQuality = normalizeContentProvenance(input.contentProvenance);
    const committed = await runWithChapterSource({
      novelId: input.novelId,
      chapterId: input.chapterId,
      contentHash,
      signal: input.signal,
      dependencies: chapters.filter((item) => item.order < chapter.order).map((item) => ({
        chapterId: item.id,
        contentHash: buildContentHash(item.content ?? ""),
      })),
    }, async () => {
      const characterDialogueInfluenceExpiredCount = await this.characters.expirePastCharacterDialogueInfluences({
        novelId: input.novelId,
        chapterOrder: chapter.order,
      });
      const concreteFactCount = await this.store.persistChapterSummaryAndFacts({
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterOrder: chapter.order,
        content,
        output,
      });
      const stateSnapshotId = output.syncPlan.stateSnapshot === "skip"
        ? null
        : await this.store.persistStateSnapshot({
          novelId: input.novelId,
          chapterId: input.chapterId,
          output,
        });

      const resourceProposals = output.syncPlan.characterResources === "skip"
        ? []
        : this.store.toCharacterResourceProposals({
          novelId: input.novelId,
          chapterId: input.chapterId,
          chapterOrder: chapter.order,
          sourceType,
          sourceStage,
          contentHash,
          sourceQuality,
          characters,
          updates: output.characterResourceDeltas,
        });

      const stateCommitResult = await stateCommitService.proposeAndCommit({
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterOrder: chapter.order,
        sourceType,
        sourceStage,
        contentProvenance: sourceQuality,
        proposals: resourceProposals,
      });
      const staleMarkedCount = await characterResourceStaleScanService.scanAfterChapter({
        novelId: input.novelId,
        chapterId: input.chapterId,
        chapterOrder: chapter.order,
      });

      const [payoffDeltaCount, characterDynamicsCount, characterKnowledgeStateCount, characterMindSnapshotCount, characterDialogueInfluenceAppliedCount] = await Promise.all([
        output.syncPlan.payoffLedger === "skip"
          ? Promise.resolve(0)
          : this.store.applyPayoffDeltas({
            novelId: input.novelId,
            chapterId: input.chapterId,
            chapterOrder: chapter.order,
            chapterTitle: chapter.title,
            chapters,
            output,
            stateSnapshotId,
          }),
        output.syncPlan.characterDynamics === "skip"
          ? Promise.resolve(0)
          : this.characters.applyCharacterDynamics({
            novelId: input.novelId,
            chapterId: input.chapterId,
            chapterOrder: chapter.order,
            characters,
            output,
          }),
        output.characterKnowledgeStates.length === 0
          ? Promise.resolve(0)
          : this.characters.applyKnowledgeStates({
            characters,
            output,
          }),
        output.characterMindDeltas.length === 0
          ? Promise.resolve(0)
          : characterMindService.applyChapterMindDeltas({
            novelId: input.novelId,
            chapterId: input.chapterId,
            deltas: output.characterMindDeltas,
          }),
        output.characterDialogueInfluenceResolutions.length === 0
          ? Promise.resolve(0)
          : this.characters.applyCharacterDialogueInfluenceResolutions({
            novelId: input.novelId,
            chapterId: input.chapterId,
            chapterOrder: chapter.order,
            activeInfluences: activeCharacterDialogueInfluences,
            resolutions: output.characterDialogueInfluenceResolutions,
          }),
      ]);

      return {
        contentHash,
        output,
        stateSnapshotId,
        characterResourceProposalCount: resourceProposals.length,
        characterDynamicsCount,
        characterKnowledgeStateCount,
        characterMindSnapshotCount,
        characterDialogueInfluenceAppliedCount,
        characterDialogueInfluenceExpiredCount,
        payoffDeltaCount,
        canonicalCommittedCount: stateCommitResult.committed.length,
        concreteFactCount,
        staleMarkedCount,
        requiresFullReconcile: output.requiresFullReconcile || output.syncPlan.payoffLedger === "full_reconcile",
      };
    });
    await Promise.all(["chapter", "chapter_summary"].map((ownerType) => ragServices.ragIndexService.enqueueUpsert(ownerType as RagOwnerType, input.chapterId).catch(() => null)));
    return committed;
  }

  buildCharacterRosterText(characters: CharacterLookupItem[]): string {
    return characters.slice(0, 16).map((character) => [
      `- ${character.id}`,
      compactPromptText(character.name, 80),
      compactPromptText(character.role, 120),
      character.castRole ? `cast=${character.castRole}` : "",
      character.currentGoal ? `goal=${compactPromptText(character.currentGoal, 240)}` : "",
      character.currentState ? `state=${compactPromptText(character.currentState, 480)}` : "",
    ].filter(Boolean).join(" | ")).join("\n");
  }

}
export const chapterArtifactDeltaService = new ChapterArtifactDeltaService();
