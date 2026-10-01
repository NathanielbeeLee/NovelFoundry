import type { CharacterRelationStage, DynamicCharacterOverview } from "@novelfoundry/shared/types/characterDynamics";

import { prisma } from "../../../../../db/prisma";

import type { ConfirmCandidateInput, MergeCandidateInput, UpdateCharacterDynamicStateInput, UpdateRelationStageInput } from "../../characterDynamicsSchemas";

import { MANUAL_SOURCE_TYPE } from "../../characterDynamicsShared";

import { toCharacterRelationStage } from "../../characterDynamicsUtils";

import { CharacterDynamicsStateService } from "./CharacterDynamicsStateService";

export class CharacterDynamicsMutationService extends CharacterDynamicsStateService {
  async confirmCandidate(novelId: string, candidateId: string, input: ConfirmCandidateInput) {
    const candidate = await prisma.characterCandidate.findFirst({
      where: { id: candidateId, novelId },
      include: {
        sourceChapter: {
          select: { id: true, order: true },
        },
      },
    });
    if (!candidate) {
      throw new Error("角色候选不存在。");
    }

    const createdCharacter = await this.novelContextServiceFactory().createCharacter(novelId, {
      name: candidate.proposedName,
      role: input.role?.trim() || candidate.proposedRole?.trim() || "新角色",
      castRole: input.castRole,
      relationToProtagonist: input.relationToProtagonist?.trim() || undefined,
      currentState: input.currentState?.trim() || undefined,
      currentGoal: input.currentGoal?.trim() || undefined,
      background: input.summary?.trim() || candidate.summary?.trim() || undefined,
    });

    await prisma.$transaction(async (tx) => {
      await tx.characterCandidate.update({
        where: { id: candidate.id },
        data: {
          matchedCharacterId: createdCharacter.id,
          status: "confirmed",
        },
      });
      await tx.creativeDecision.create({
        data: {
          novelId,
          chapterId: candidate.sourceChapter?.id ?? null,
          category: "character_dynamic_confirm",
          content: `确认新角色：${createdCharacter.name}。来源候选：${candidate.proposedName}。${candidate.summary ?? ""}`.trim(),
          importance: "high",
          sourceType: "character_candidate",
          sourceRefId: candidate.id,
          expiresAt: candidate.sourceChapter?.order ? candidate.sourceChapter.order + 6 : null,
        },
      });
    });

    await this.rebuildDynamics(novelId, { sourceType: "rebuild_projection" });
    await this.recordCharacterInjectionBeatImpact({
      novelId,
      characterName: createdCharacter.name,
      sourceChapterId: candidate.sourceChapter?.id ?? null,
      sourceChapterOrder: candidate.sourceChapter?.order ?? null,
      sourceType: "character_candidate",
      sourceRefId: candidate.id,
    });
    return {
      candidateId: candidate.id,
      characterId: createdCharacter.id,
    };
  }

  async mergeCandidate(novelId: string, candidateId: string, input: MergeCandidateInput) {
    const [candidate, character] = await Promise.all([
      prisma.characterCandidate.findFirst({
        where: { id: candidateId, novelId },
        include: {
          sourceChapter: {
            select: { id: true, order: true },
          },
        },
      }),
      prisma.character.findFirst({
        where: { id: input.characterId, novelId },
        select: { id: true, name: true },
      }),
    ]);
    if (!candidate) {
      throw new Error("角色候选不存在。");
    }
    if (!character) {
      throw new Error("要合并到的角色不存在。");
    }

    await prisma.$transaction(async (tx) => {
      await tx.characterCandidate.update({
        where: { id: candidate.id },
        data: {
          matchedCharacterId: character.id,
          status: "merged",
        },
      });
      await tx.creativeDecision.create({
        data: {
          novelId,
          chapterId: candidate.sourceChapter?.id ?? null,
          category: "character_dynamic_merge",
          content: `候选角色 ${candidate.proposedName} 已并入 ${character.name}。${input.summary?.trim() || candidate.summary || ""}`.trim(),
          importance: "normal",
          sourceType: "character_candidate",
          sourceRefId: candidate.id,
          expiresAt: candidate.sourceChapter?.order ? candidate.sourceChapter.order + 4 : null,
        },
      });
    });

    await this.rebuildDynamics(novelId, { sourceType: "rebuild_projection" });
    await this.recordCharacterInjectionBeatImpact({
      novelId,
      characterName: character.name,
      sourceChapterId: candidate.sourceChapter?.id ?? null,
      sourceChapterOrder: candidate.sourceChapter?.order ?? null,
      sourceType: "character_candidate",
      sourceRefId: candidate.id,
    });
    return {
      candidateId: candidate.id,
      characterId: character.id,
    };
  }

  async updateCharacterDynamicState(novelId: string, characterId: string, input: UpdateCharacterDynamicStateInput): Promise<DynamicCharacterOverview> {
    const character = await prisma.character.findFirst({
      where: { id: characterId, novelId },
      select: { id: true, name: true },
    });
    if (!character) {
      throw new Error("角色不存在。");
    }

    const overview = await this.queryService.getOverview(novelId, {
      chapterOrder: input.chapterOrder,
    });
    const volumeId = input.volumeId || overview.currentVolume?.id || null;

    await prisma.$transaction(async (tx) => {
      if (typeof input.currentState === "string" || typeof input.currentGoal === "string") {
        await tx.character.update({
          where: { id: characterId },
          data: {
            ...(typeof input.currentState === "string" ? { currentState: input.currentState } : {}),
            ...(typeof input.currentGoal === "string" ? { currentGoal: input.currentGoal } : {}),
            lastEvolvedAt: new Date(),
          },
        });
      }

      if (volumeId && (
        typeof input.roleLabel === "string"
        || typeof input.responsibility === "string"
        || typeof input.appearanceExpectation === "string"
        || Array.isArray(input.plannedChapterOrders)
        || typeof input.isCore === "boolean"
      )) {
        const existingAssignment = await tx.characterVolumeAssignment.findFirst({
          where: { novelId, characterId, volumeId },
        });
        if (existingAssignment) {
          await tx.characterVolumeAssignment.update({
            where: { id: existingAssignment.id },
            data: {
              ...(typeof input.roleLabel === "string" ? { roleLabel: input.roleLabel || null } : {}),
              ...(typeof input.responsibility === "string" ? { responsibility: input.responsibility } : {}),
              ...(typeof input.appearanceExpectation === "string" ? { appearanceExpectation: input.appearanceExpectation || null } : {}),
              ...(Array.isArray(input.plannedChapterOrders) ? { plannedChapterOrdersJson: JSON.stringify(input.plannedChapterOrders) } : {}),
              ...(typeof input.isCore === "boolean" ? { isCore: input.isCore } : {}),
              ...(typeof input.absenceWarningThreshold === "number" ? { absenceWarningThreshold: input.absenceWarningThreshold } : {}),
              ...(typeof input.absenceHighRiskThreshold === "number" ? { absenceHighRiskThreshold: input.absenceHighRiskThreshold } : {}),
            },
          });
        } else if (typeof input.responsibility === "string") {
          await tx.characterVolumeAssignment.create({
            data: {
              novelId,
              characterId,
              volumeId,
              roleLabel: input.roleLabel || null,
              responsibility: input.responsibility,
              appearanceExpectation: input.appearanceExpectation || null,
              plannedChapterOrdersJson: JSON.stringify(input.plannedChapterOrders ?? []),
              isCore: input.isCore ?? false,
              absenceWarningThreshold: input.absenceWarningThreshold ?? 3,
              absenceHighRiskThreshold: input.absenceHighRiskThreshold ?? 5,
            },
          });
        }
      }

      if (typeof input.factionLabel === "string" && input.factionLabel.trim()) {
        await tx.characterFactionTrack.create({
          data: {
            novelId,
            characterId,
            volumeId,
            chapterId: input.chapterId ?? null,
            chapterOrder: input.chapterOrder ?? null,
            factionLabel: input.factionLabel,
            stanceLabel: input.stanceLabel || null,
            summary: input.summary || null,
            sourceType: MANUAL_SOURCE_TYPE,
          },
        });
      }

      const decisionSegments = [
        typeof input.currentState === "string" ? `状态=${input.currentState}` : "",
        typeof input.currentGoal === "string" ? `目标=${input.currentGoal}` : "",
        typeof input.factionLabel === "string" ? `阵营=${input.factionLabel}` : "",
        typeof input.roleLabel === "string" ? `卷级身份=${input.roleLabel}` : "",
        typeof input.responsibility === "string" ? `职责=${input.responsibility}` : "",
        input.decisionNote?.trim() || "",
      ].filter(Boolean);
      if (decisionSegments.length > 0) {
        await tx.creativeDecision.create({
          data: {
            novelId,
            chapterId: input.chapterId ?? null,
            category: "character_dynamic_manual_update",
            content: `${character.name} 动态状态更新：${decisionSegments.join("；")}`,
            importance: "normal",
            sourceType: "character_dynamic_state",
            sourceRefId: character.id,
            expiresAt: input.chapterOrder ? input.chapterOrder + 5 : null,
          },
        });
      }
    });

    const shouldRecordForwardImpact = Boolean(
      typeof input.roleLabel === "string"
      || typeof input.responsibility === "string"
      || typeof input.appearanceExpectation === "string"
      || Array.isArray(input.plannedChapterOrders)
      || typeof input.isCore === "boolean",
    );
    if (shouldRecordForwardImpact) {
      await this.recordCharacterInjectionBeatImpact({
        novelId,
        characterName: character.name,
        sourceChapterId: input.chapterId ?? null,
        sourceChapterOrder: input.chapterOrder ?? null,
        sourceType: "character_dynamic_state",
        sourceRefId: character.id,
      });
    }

    return this.queryService.getOverview(novelId, {
      chapterOrder: input.chapterOrder,
    });
  }

  async updateRelationStage(novelId: string, relationId: string, input: UpdateRelationStageInput): Promise<CharacterRelationStage> {
    const relation = await prisma.characterRelation.findFirst({
      where: { id: relationId, novelId },
      include: {
        sourceCharacter: { select: { name: true } },
        targetCharacter: { select: { name: true } },
      },
    });
    if (!relation) {
      throw new Error("角色关系不存在。");
    }

    const created = await prisma.$transaction(async (tx) => {
      await tx.characterRelationStage.updateMany({
        where: {
          novelId,
          sourceCharacterId: relation.sourceCharacterId,
          targetCharacterId: relation.targetCharacterId,
          isCurrent: true,
        },
        data: {
          isCurrent: false,
        },
      });
      const nextStage = await tx.characterRelationStage.create({
        data: {
          novelId,
          relationId: relation.id,
          sourceCharacterId: relation.sourceCharacterId,
          targetCharacterId: relation.targetCharacterId,
          volumeId: input.volumeId ?? null,
          chapterId: input.chapterId ?? null,
          chapterOrder: input.chapterOrder ?? null,
          stageLabel: input.stageLabel,
          stageSummary: input.stageSummary,
          nextTurnPoint: input.nextTurnPoint || null,
          sourceType: MANUAL_SOURCE_TYPE,
          confidence: input.confidence ?? null,
          isCurrent: true,
        },
        include: {
          sourceCharacter: { select: { name: true } },
          targetCharacter: { select: { name: true } },
          volume: { select: { title: true } },
        },
      });
      await tx.creativeDecision.create({
        data: {
          novelId,
          chapterId: input.chapterId ?? null,
          category: "character_relation_stage_manual_update",
          content: `${relation.sourceCharacter.name} -> ${relation.targetCharacter.name} 关系阶段更新为 ${input.stageLabel}。${input.decisionNote?.trim() || input.stageSummary}`.trim(),
          importance: "normal",
          sourceType: "character_relation_stage",
          sourceRefId: relation.id,
          expiresAt: input.chapterOrder ? input.chapterOrder + 5 : null,
        },
      });
      return nextStage;
    });

    return toCharacterRelationStage(created);
  }

  async autoConfirmPendingCandidates(novelId: string): Promise<void> {
    const candidates = await prisma.characterCandidate.findMany({
      where: { novelId, status: "pending" },
      include: {
        sourceChapter: { select: { id: true, order: true } },
      },
    });
    if (candidates.length === 0) {
      return;
    }
    const novelContextService = this.novelContextServiceFactory();
    for (const candidate of candidates) {
      const createdCharacter = await novelContextService.createCharacter(novelId, {
        name: candidate.proposedName,
        role: candidate.proposedRole?.trim() || "新角色",
        background: candidate.summary?.trim() || undefined,
      });
      await prisma.$transaction(async (tx) => {
        await tx.characterCandidate.update({
          where: { id: candidate.id },
          data: { matchedCharacterId: createdCharacter.id, status: "confirmed" },
        });
        await tx.creativeDecision.create({
          data: {
            novelId,
            chapterId: candidate.sourceChapter?.id ?? null,
            category: "character_dynamic_confirm",
            content: `自动导演确认新角色：${createdCharacter.name}。来源候选：${candidate.proposedName}。${candidate.summary ?? ""}`.trim(),
            importance: "high",
            sourceType: "character_candidate",
            sourceRefId: candidate.id,
            expiresAt: candidate.sourceChapter?.order ? candidate.sourceChapter.order + 6 : null,
          },
        });
      });
    }
    await this.rebuildDynamics(novelId, { sourceType: "rebuild_projection" });
    for (const candidate of candidates) {
      await this.recordCharacterInjectionBeatImpact({
        novelId,
        characterName: candidate.proposedName,
        sourceChapterId: candidate.sourceChapter?.id ?? null,
        sourceChapterOrder: candidate.sourceChapter?.order ?? null,
        sourceType: "character_candidate",
        sourceRefId: candidate.id,
      });
    }
  }
}
