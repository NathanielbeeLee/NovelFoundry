import {
  type ChapterArtifactDeltaOutput
} from "../../../../prompting/prompts/novel/chapterArtifactDelta.prompts";
import { artifactPrisma as prisma } from "../infrastructure/ChapterSourceTransaction";

import {
  ActiveCharacterDialogueInfluence,
  ARTIFACT_DELTA_SOURCE_TYPE,
  buildKnowledgeBoundaryLine,
  ChapterArtifactDialogueInfluenceResolution,
  CharacterLookupItem,
  clampConfidence,
  mergeKnowledgeBoundaryState,
  normalizeName,
  uniqueTextItems,
} from "../domain/ChapterArtifactMapping";

export class ChapterCharacterArtifactStore {

  async expirePastCharacterDialogueInfluences(input: {
    novelId: string;
    chapterOrder: number;
  }): Promise<number> {
    const result = await prisma.characterDialogueInfluence.updateMany({
      where: {
        novelId: input.novelId,
        status: "active",
        targetEndChapterOrder: { lt: input.chapterOrder },
      },
      data: { status: "expired" },
    });
    return result.count;
  }

  async listActiveCharacterDialogueInfluences(input: {
    novelId: string;
    chapterOrder: number;
  }): Promise<ActiveCharacterDialogueInfluence[]> {
    const rows = await prisma.characterDialogueInfluence.findMany({
      where: {
        novelId: input.novelId,
        status: "active",
        targetStartChapterOrder: { lte: input.chapterOrder },
        targetEndChapterOrder: { gte: input.chapterOrder },
      },
      select: {
        id: true,
        characterId: true,
        summary: true,
        behaviorGuidance: true,
        emotionalGuidance: true,
        relationTension: true,
        targetStartChapterOrder: true,
        targetEndChapterOrder: true,
        character: { select: { name: true } },
      },
      orderBy: [{ activatedAt: "desc" }, { updatedAt: "desc" }],
      take: 8,
    });
    return rows.map((row) => ({
      id: row.id,
      characterId: row.characterId,
      characterName: row.character.name,
      summary: row.summary,
      behaviorGuidance: row.behaviorGuidance,
      emotionalGuidance: row.emotionalGuidance,
      relationTension: row.relationTension,
      targetStartChapterOrder: row.targetStartChapterOrder,
      targetEndChapterOrder: row.targetEndChapterOrder,
    }));
  }

  async applyCharacterDialogueInfluenceResolutions(input: {
    novelId: string;
    chapterId: string;
    chapterOrder: number;
    activeInfluences: ActiveCharacterDialogueInfluence[];
    resolutions: ChapterArtifactDialogueInfluenceResolution[];
  }): Promise<number> {
    const activeInfluenceIds = new Set(input.activeInfluences.map((influence) => influence.id));
    const appliedResolutions = input.resolutions.filter((resolution) => (
      resolution.status === "applied"
      && resolution.evidence.length > 0
      && activeInfluenceIds.has(resolution.influenceId)
    ));
    if (appliedResolutions.length === 0) {
      return 0;
    }

    const resolvedAt = new Date();
    const results = await Promise.all(appliedResolutions.map((resolution) => (
      prisma.characterDialogueInfluence.updateMany({
        where: {
          id: resolution.influenceId,
          novelId: input.novelId,
          status: "active",
          targetStartChapterOrder: { lte: input.chapterOrder },
          targetEndChapterOrder: { gte: input.chapterOrder },
        },
        data: {
          status: "applied",
          appliedAt: resolvedAt,
          resolvedChapterId: input.chapterId,
          resolutionEvidenceJson: JSON.stringify(uniqueTextItems(resolution.evidence, 3)),
        },
      })
    )));
    return results.reduce((count, result) => count + result.count, 0);
  }

  async applyCharacterDynamics(input: {
    novelId: string;
    chapterId: string;
    chapterOrder: number;
    characters: CharacterLookupItem[];
    output: ChapterArtifactDeltaOutput;
  }): Promise<number> {
    const characterByName = new Map(input.characters.map((item) => [normalizeName(item.name), item]));
    const [currentVolume, relations] = await Promise.all([
      prisma.volumePlan.findFirst({
        where: {
          novelId: input.novelId,
          chapters: {
            some: { chapterOrder: input.chapterOrder },
          },
        },
        select: { id: true },
      }),
      prisma.characterRelation.findMany({
        where: { novelId: input.novelId },
        select: {
          id: true,
          sourceCharacterId: true,
          targetCharacterId: true,
        },
      }),
    ]);
    const relationByPair = new Map(relations.map((relation) => [
      `${relation.sourceCharacterId}:${relation.targetCharacterId}`,
      relation,
    ]));

    let writeCount = 0;
    await prisma.$transaction(async (tx) => {
      await tx.characterCandidate.deleteMany({
        where: {
          novelId: input.novelId,
          sourceChapterId: input.chapterId,
          status: "pending",
        },
      });
      for (const candidate of input.output.characterCandidates) {
        const proposed = characterByName.get(normalizeName(candidate.proposedName));
        const matched = candidate.matchedCharacterName
          ? characterByName.get(normalizeName(candidate.matchedCharacterName))
          : proposed;
        if (matched) {
          continue;
        }
        await tx.characterCandidate.create({
          data: {
            novelId: input.novelId,
            sourceChapterId: input.chapterId,
            proposedName: candidate.proposedName,
            proposedRole: candidate.proposedRole || null,
            summary: candidate.summary || null,
            evidenceJson: JSON.stringify(Array.from(new Set(candidate.evidence))),
            matchedCharacterId: null,
            status: "pending",
            confidence: clampConfidence(candidate.confidence),
          },
        });
        writeCount += 1;
      }

      await tx.characterFactionTrack.deleteMany({
        where: {
          novelId: input.novelId,
          chapterId: input.chapterId,
          sourceType: ARTIFACT_DELTA_SOURCE_TYPE,
        },
      });
      for (const update of input.output.factionUpdates) {
        const character = characterByName.get(normalizeName(update.characterName));
        if (!character) {
          continue;
        }
        await tx.characterFactionTrack.create({
          data: {
            novelId: input.novelId,
            characterId: character.id,
            volumeId: currentVolume?.id ?? null,
            chapterId: input.chapterId,
            chapterOrder: input.chapterOrder,
            factionLabel: update.factionLabel,
            stanceLabel: update.stanceLabel || null,
            summary: update.summary || null,
            sourceType: ARTIFACT_DELTA_SOURCE_TYPE,
            confidence: clampConfidence(update.confidence),
          },
        });
        writeCount += 1;
      }

      await tx.characterRelationStage.deleteMany({
        where: {
          novelId: input.novelId,
          chapterId: input.chapterId,
          sourceType: ARTIFACT_DELTA_SOURCE_TYPE,
        },
      });
      for (const dynamic of input.output.relationDynamics) {
        const sourceCharacter = characterByName.get(normalizeName(dynamic.sourceCharacterName));
        const targetCharacter = characterByName.get(normalizeName(dynamic.targetCharacterName));
        if (!sourceCharacter || !targetCharacter || sourceCharacter.id === targetCharacter.id) {
          continue;
        }
        await tx.characterRelationStage.updateMany({
          where: {
            novelId: input.novelId,
            sourceCharacterId: sourceCharacter.id,
            targetCharacterId: targetCharacter.id,
            isCurrent: true,
          },
          data: { isCurrent: false },
        });
        const relation = relationByPair.get(`${sourceCharacter.id}:${targetCharacter.id}`) ?? null;
        await tx.characterRelationStage.create({
          data: {
            novelId: input.novelId,
            relationId: relation?.id ?? null,
            sourceCharacterId: sourceCharacter.id,
            targetCharacterId: targetCharacter.id,
            volumeId: currentVolume?.id ?? null,
            chapterId: input.chapterId,
            chapterOrder: input.chapterOrder,
            stageLabel: dynamic.stageLabel,
            stageSummary: dynamic.stageSummary,
            nextTurnPoint: dynamic.nextTurnPoint || null,
            sourceType: ARTIFACT_DELTA_SOURCE_TYPE,
            confidence: clampConfidence(dynamic.confidence),
            isCurrent: true,
          },
        });
        writeCount += 1;
      }
    });
    return writeCount;
  }

  async applyKnowledgeStates(input: {
    characters: CharacterLookupItem[];
    output: ChapterArtifactDeltaOutput;
  }): Promise<number> {
    const characterByName = new Map(input.characters.map((item) => [normalizeName(item.name), item]));
    const updates = input.output.characterKnowledgeStates
      .map((state) => {
        const character = characterByName.get(normalizeName(state.characterName));
        const boundaryLine = buildKnowledgeBoundaryLine(state);
        if (!character || !boundaryLine) {
          return null;
        }
        const nextCurrentState = mergeKnowledgeBoundaryState(character.currentState, boundaryLine);
        if (nextCurrentState === (character.currentState ?? "")) {
          return null;
        }
        return {
          characterId: character.id,
          currentState: nextCurrentState,
        };
      })
      .filter((item): item is { characterId: string; currentState: string; } => Boolean(item));
    if (updates.length === 0) {
      return 0;
    }

    await prisma.$transaction(async (tx) => {
      for (const update of updates) {
        await tx.character.update({
          where: { id: update.characterId },
          data: { currentState: update.currentState },
        });
      }
    });
    return updates.length;
  }

}
