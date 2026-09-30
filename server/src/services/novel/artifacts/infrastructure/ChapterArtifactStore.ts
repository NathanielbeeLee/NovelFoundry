import type {
  ContentProvenance,
  StateChangeProposal,
} from "@novelfoundry/shared/types/canonicalState";
import {
  type ChapterArtifactDeltaOutput
} from "../../../../prompting/prompts/novel/chapterArtifactDelta.prompts";
import {
  clearStaleRiskSignal,
  dedupeRiskSignals,
  serializeLedgerJson,
} from "../../../payoff/payoffLedgerShared";
import {
  resolveSnapshotChapterReference,
  stateService,
} from "../../../state/StateService";
import type { SnapshotExtractionOutput } from "../../../state/stateSnapshotExtraction";
import {
  compactText,
  normalizeResourceKey,
} from "../../characterResource/characterResourceShared";
import { novelFactService, type NovelFactWriteItem } from "../../fact/NovelFactService";
import { extractFacts } from "../../novelP0Utils";
import { attachProposalSourceQuality } from "../../state/stateProposalSourceQuality";
import { currentChapterSource, artifactPrisma as prisma } from "../infrastructure/ChapterSourceTransaction";

import {
  ChapterArtifactDeltaResourceUpdate,
  ChapterReference,
  CharacterLookupItem,
  cleanNullableText,
  cleanOptionalText,
  joinFactContents,
  normalizeLedgerKey,
  resolveCharacter,
} from "../domain/ChapterArtifactMapping";

export class ChapterArtifactStore {

  async persistChapterSummaryAndFacts(input: {
    novelId: string;
    chapterId: string;
    chapterOrder: number;
    content: string;
    output: ChapterArtifactDeltaOutput;
  }): Promise<number> {
    const summary = compactText(input.output.summary) || "暂无可总结正文";
    const extractedFacts = extractFacts(input.content || summary);
    const keyEvents = joinFactContents(
      extractedFacts.filter((item) => item.category === "plot").map((item) => item.content),
      3,
    );
    const characterStates = joinFactContents(
      extractedFacts.filter((item) => item.category === "character").map((item) => item.content),
      3,
    );
    await prisma.$transaction(async (tx) => {
      await tx.chapter.update({
        where: { id: input.chapterId },
        data: { expectation: summary },
      });
      await tx.chapterSummary.upsert({
        where: { chapterId: input.chapterId },
        update: {
          summary,
          sourceContentHash: currentChapterSource()?.contentHash ?? null,
          keyEvents,
          characterStates,
        },
        create: {
          novelId: input.novelId,
          chapterId: input.chapterId,
          summary,
          sourceContentHash: currentChapterSource()?.contentHash ?? null,
          keyEvents,
          characterStates,
        },
      });
    });

    const concreteFacts: NovelFactWriteItem[] = input.output.concreteFacts
      .map((fact) => ({
        text: compactText(fact.text),
        category: fact.category,
        source: "auto" as const,
      }))
      .filter((fact) => fact.text.length > 0);
    if (concreteFacts.length > 0) {
      await novelFactService.writeFacts(input.novelId, input.chapterOrder, concreteFacts);
    }



    return concreteFacts.length;
  }

  async persistStateSnapshot(input: {
    novelId: string;
    chapterId: string;
    output: ChapterArtifactDeltaOutput;
  }): Promise<string | null> {
    const state = input.output.stateDeltas;
    const extracted: SnapshotExtractionOutput = {
      summary: cleanOptionalText(state.summary) ?? input.output.summary,
      characterStates: state.characterStates.map((item) => ({
        characterId: cleanOptionalText(item.characterId),
        characterName: cleanOptionalText(item.characterName),
        currentGoal: cleanOptionalText(item.currentGoal),
        emotion: cleanOptionalText(item.emotion),
        stressLevel: typeof item.stressLevel === "number" ? item.stressLevel : undefined,
        secretExposure: cleanOptionalText(item.secretExposure),
        knownFacts: item.knownFacts,
        misbeliefs: item.misbeliefs,
        summary: cleanOptionalText(item.summary),
      })),
      relationStates: state.relationStates.map((item) => ({
        sourceCharacterId: cleanOptionalText(item.sourceCharacterId),
        sourceCharacterName: cleanOptionalText(item.sourceCharacterName),
        targetCharacterId: cleanOptionalText(item.targetCharacterId),
        targetCharacterName: cleanOptionalText(item.targetCharacterName),
        trustScore: typeof item.trustScore === "number" ? item.trustScore : undefined,
        intimacyScore: typeof item.intimacyScore === "number" ? item.intimacyScore : undefined,
        conflictScore: typeof item.conflictScore === "number" ? item.conflictScore : undefined,
        dependencyScore: typeof item.dependencyScore === "number" ? item.dependencyScore : undefined,
        summary: cleanOptionalText(item.summary),
      })),
      informationStates: state.informationStates.map((item) => ({
        holderType: item.holderType,
        holderRefId: cleanNullableText(item.holderRefId),
        holderRefName: cleanNullableText(item.holderRefName),
        fact: item.fact,
        status: item.status,
        summary: cleanOptionalText(item.summary),
      })),
      foreshadowStates: state.foreshadowStates.map((item) => ({
        title: item.title,
        summary: cleanOptionalText(item.summary),
        status: item.status,
        setupChapterId: cleanOptionalText(item.setupChapterId),
        payoffChapterId: cleanNullableText(item.payoffChapterId),
      })),
    };
    const snapshot = await stateService.persistExtractedChapterSnapshot({
      novelId: input.novelId,
      chapterId: input.chapterId,
      extracted,
      skipPayoffLedgerSync: true,
    });
    return snapshot?.id ?? null;
  }

  toCharacterResourceProposals(input: {
    novelId: string;
    chapterId: string;
    chapterOrder: number;
    sourceType: string;
    sourceStage: string | null;
    contentHash: string;
    sourceQuality: ContentProvenance;
    characters: CharacterLookupItem[];
    updates: ChapterArtifactDeltaResourceUpdate[];
  }): StateChangeProposal[] {
    return input.updates.map((update) => {
      const holderCharacter = resolveCharacter(input.characters, update.holderCharacterName);
      const previousHolderCharacter = resolveCharacter(input.characters, update.previousHolderCharacterName);
      const knownByCharacterIds = update.knownByCharacterNames
        .map((name) => resolveCharacter(input.characters, name)?.id)
        .filter((id): id is string => Boolean(id));
      const ownerCharacter = update.ownerType === "character"
        ? resolveCharacter(input.characters, update.ownerName) ?? holderCharacter
        : null;
      const resourceKey = normalizeResourceKey({
        name: update.resourceName,
        holderCharacterId: holderCharacter?.id,
        ownerName: update.ownerName ?? null,
      });
      const proposal: StateChangeProposal = {
        novelId: input.novelId,
        chapterId: input.chapterId,
        sourceSnapshotId: null,
        sourceType: input.sourceType,
        sourceStage: input.sourceStage,
        proposalType: "character_resource_update",
        riskLevel: update.riskLevel,
        status: "validated",
        summary: `${update.resourceName} resource delta in chapter ${input.chapterOrder}`,
        payload: {
          resourceKey,
          resourceName: update.resourceName,
          chapterOrder: input.chapterOrder,
          resourceType: update.resourceType,
          narrativeFunction: update.narrativeFunction,
          updateType: update.updateType,
          ownerType: update.ownerType,
          ownerId: ownerCharacter?.id ?? null,
          ownerName: update.ownerName ?? update.holderCharacterName ?? null,
          holderCharacterId: holderCharacter?.id ?? null,
          holderCharacterName: holderCharacter?.name ?? update.holderCharacterName ?? null,
          previousHolderCharacterId: previousHolderCharacter?.id ?? null,
          statusAfter: update.statusAfter,
          visibilityAfter: {
            readerKnows: update.readerKnows,
            holderKnows: update.holderKnows,
            knownByCharacterIds,
          },
          summary: update.summary ?? undefined,
          narrativeImpact: update.narrativeImpact,
          expectedFutureUse: update.expectedFutureUse ?? null,
          expectedUseStartChapterOrder: update.expectedUseStartChapterOrder ?? null,
          expectedUseEndChapterOrder: update.expectedUseEndChapterOrder ?? null,
          constraints: update.constraints,
          confidence: update.confidence ?? null,
          syncContentHash: input.contentHash,
        },
        evidence: update.evidence,
        validationNotes: [update.riskReason ?? ""].filter(Boolean),
      };
      return attachProposalSourceQuality(proposal, input.sourceQuality);
    });
  }

  async applyPayoffDeltas(input: {
    novelId: string;
    chapterId: string;
    chapterOrder: number;
    chapterTitle: string;
    chapters: ChapterReference[];
    output: ChapterArtifactDeltaOutput;
    stateSnapshotId: string | null;
  }): Promise<number> {
    if (input.output.payoffDeltas.length === 0) {
      return 0;
    }
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      for (const item of input.output.payoffDeltas) {
        const ledgerKey = normalizeLedgerKey(item.ledgerKey, normalizeLedgerKey(item.title, `chapter_${input.chapterOrder}_payoff`));
        const previous = await tx.payoffLedgerItem.findUnique({
          where: {
            novelId_ledgerKey: {
              novelId: input.novelId,
              ledgerKey,
            },
          },
        });
        const setupChapterId = this.resolveChapterReference({
          value: item.setupChapterId ?? item.setupChapterOrder ?? item.firstSeenChapterOrder,
          chapters: input.chapters,
          currentChapterId: input.chapterId,
          fallbackToCurrentChapter: item.currentStatus === "setup" || item.currentStatus === "hinted",
        }) ?? previous?.setupChapterId ?? null;
        const payoffChapterId = this.resolveChapterReference({
          value: item.payoffChapterId ?? item.payoffChapterOrder,
          chapters: input.chapters,
          currentChapterId: input.chapterId,
          fallbackToCurrentChapter: item.currentStatus === "paid_off",
        }) ?? previous?.payoffChapterId ?? null;
        const lastTouchedChapterId = this.resolveChapterReference({
          value: item.lastTouchedChapterOrder,
          chapters: input.chapters,
          currentChapterId: input.chapterId,
          fallbackToCurrentChapter: true,
        }) ?? input.chapterId;
        const sourceRefs = item.sourceRefs.length > 0
          ? item.sourceRefs.map((ref) => ({
            ...ref,
            chapterId: ref.chapterId ?? lastTouchedChapterId,
            chapterOrder: ref.chapterOrder ?? input.chapterOrder,
          }))
          : [{
            kind: "chapter_payoff_ref" as const,
            refId: null,
            refLabel: `第${input.chapterOrder}章《${input.chapterTitle}》`,
            chapterId: input.chapterId,
            chapterOrder: input.chapterOrder,
            volumeId: null,
            volumeSortOrder: null,
          }];
        const evidence = item.evidence.length > 0
          ? item.evidence.map((evidenceItem) => ({
            ...evidenceItem,
            chapterId: evidenceItem.chapterId ?? input.chapterId,
            chapterOrder: evidenceItem.chapterOrder ?? input.chapterOrder,
          }))
          : [{
            summary: item.summary,
            chapterId: input.chapterId,
            chapterOrder: input.chapterOrder,
          }];
        const riskSignals = clearStaleRiskSignal(dedupeRiskSignals(item.riskSignals.map((signal) => ({
          code: signal.code,
          severity: signal.severity,
          summary: signal.summary,
        }))));
        await tx.payoffLedgerItem.upsert({
          where: {
            novelId_ledgerKey: {
              novelId: input.novelId,
              ledgerKey,
            },
          },
          create: {
            novelId: input.novelId,
            ledgerKey,
            title: item.title,
            summary: item.summary,
            scopeType: item.scopeType,
            currentStatus: item.currentStatus,
            targetStartChapterOrder: item.targetStartChapterOrder ?? null,
            targetEndChapterOrder: item.targetEndChapterOrder ?? null,
            firstSeenChapterOrder: item.firstSeenChapterOrder ?? input.chapterOrder,
            lastTouchedChapterOrder: item.lastTouchedChapterOrder ?? input.chapterOrder,
            lastTouchedChapterId,
            setupChapterId,
            payoffChapterId,
            lastSnapshotId: input.stateSnapshotId,
            sourceRefsJson: serializeLedgerJson(sourceRefs),
            evidenceJson: serializeLedgerJson(evidence),
            riskSignalsJson: serializeLedgerJson(riskSignals),
            statusReason: item.statusReason?.trim() || null,
            confidence: item.confidence ?? null,
            updatedAt: now,
          },
          update: {
            title: item.title,
            summary: item.summary,
            scopeType: item.scopeType,
            currentStatus: item.currentStatus,
            targetStartChapterOrder: item.targetStartChapterOrder ?? null,
            targetEndChapterOrder: item.targetEndChapterOrder ?? null,
            firstSeenChapterOrder: item.firstSeenChapterOrder ?? previous?.firstSeenChapterOrder ?? input.chapterOrder,
            lastTouchedChapterOrder: item.lastTouchedChapterOrder ?? input.chapterOrder,
            lastTouchedChapterId,
            setupChapterId,
            payoffChapterId,
            lastSnapshotId: input.stateSnapshotId ?? previous?.lastSnapshotId ?? null,
            sourceRefsJson: serializeLedgerJson(sourceRefs),
            evidenceJson: serializeLedgerJson(evidence),
            riskSignalsJson: serializeLedgerJson(riskSignals),
            statusReason: item.statusReason?.trim() || null,
            confidence: item.confidence ?? null,
            updatedAt: now,
          },
        });
      }
    });
    return input.output.payoffDeltas.length;
  }

  resolveChapterReference(input: {
    value: unknown;
    chapters: ChapterReference[];
    currentChapterId: string;
    fallbackToCurrentChapter: boolean;
  }): string | null {
    return resolveSnapshotChapterReference(input);
  }

}
