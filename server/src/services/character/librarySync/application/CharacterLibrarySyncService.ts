import type { LLMProvider } from "@novelfoundry/shared/types/llm";

import { characterSyncProposalAiOutputSchema, importBaseCharacterToNovelInputSchema, type BaseCharacterImportMode, type CharacterLibraryLink, type CharacterLibraryLinkStatus, type CharacterSyncPolicy, type CharacterSyncProposal, type CharacterSyncProposalPayload, type ImportBaseCharacterToNovelInput, type NovelCharacterSaveToLibraryInput } from "@novelfoundry/shared/types/characterSync";

import { prisma } from "../../../../db/prisma";

import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";

import { characterSyncClassificationPrompt } from "../../../../prompting/prompts/character/characterSync.prompts";

import { queueRagUpsert } from "../../../novel/novelCoreSupport";

import { toJson, baseCharacterToDraft, mapLink, mapProposal, sanitizeBaseCharacterDraft, parseJsonObject, buildLibraryUpdateFields } from "../domain/syncProjection";

import { APPLY_TO_NOVEL_FIELDS, type ApplyToNovelField } from "../domain/records";

export class CharacterLibrarySyncService {
  async ensureLatestBaseRevision(baseCharacterId: string, sourceType = "backfill") {
    const latest = await prisma.baseCharacterRevision.findFirst({
      where: { baseCharacterId },
      orderBy: { version: "desc" },
    });
    if (latest) {
      return latest;
    }

    const baseCharacter = await prisma.baseCharacter.findUnique({ where: { id: baseCharacterId } });
    if (!baseCharacter) {
      throw new Error("基础角色不存在");
    }

    return prisma.baseCharacterRevision.create({
      data: {
        baseCharacterId,
        version: 1,
        snapshotJson: toJson(baseCharacterToDraft(baseCharacter)),
        changeSummary: "为现有角色库角色建立初始版本。",
        sourceType,
      },
    });
  }

  async createBaseRevision(baseCharacterId: string, changeSummary: string, sourceType = "manual", sourceRefId?: string) {
    const baseCharacter = await prisma.baseCharacter.findUnique({ where: { id: baseCharacterId } });
    if (!baseCharacter) {
      throw new Error("基础角色不存在");
    }
    const latest = await prisma.baseCharacterRevision.findFirst({
      where: { baseCharacterId },
      orderBy: { version: "desc" },
    });
    return prisma.baseCharacterRevision.create({
      data: {
        baseCharacterId,
        version: (latest?.version ?? 0) + 1,
        snapshotJson: toJson(baseCharacterToDraft(baseCharacter)),
        changeSummary,
        sourceType,
        sourceRefId,
      },
    });
  }

  async listLinks(novelId: string): Promise<CharacterLibraryLink[]> {
    const rows = await prisma.characterLibraryLink.findMany({
      where: { novelId },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });
    return rows.map(mapLink);
  }

  async listProposals(input: {
    novelId?: string;
    characterId?: string;
    baseCharacterId?: string;
    status?: "pending_review" | "applied" | "ignored" | "rejected";
  }): Promise<CharacterSyncProposal[]> {
    const rows = await prisma.characterSyncProposal.findMany({
      where: {
        novelId: input.novelId,
        characterId: input.characterId,
        baseCharacterId: input.baseCharacterId,
        status: input.status ?? "pending_review",
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 80,
    });
    return rows.map(mapProposal);
  }

  async previewNovelCharacterToLibrary(input: {
    novelId: string;
    characterId: string;
    provider?: LLMProvider;
    model?: string;
    temperature?: number;
    userIntent?: string;
  }): Promise<CharacterSyncProposal> {
    const [novel, character, link, timelines] = await Promise.all([
      prisma.novel.findUnique({
        where: { id: input.novelId },
        select: { id: true, title: true, description: true },
      }),
      prisma.character.findFirst({
        where: { id: input.characterId, novelId: input.novelId },
      }),
      prisma.characterLibraryLink.findUnique({
        where: { characterId: input.characterId },
        include: { baseCharacter: true, baseRevision: true },
      }),
      prisma.characterTimeline.findMany({
        where: { novelId: input.novelId, characterId: input.characterId },
        orderBy: [{ chapterOrder: "desc" }, { createdAt: "desc" }],
        take: 12,
      }),
    ]);

    if (!novel || !character) {
      throw new Error("小说或角色不存在");
    }

    const aiResult = await runStructuredPrompt({
      asset: characterSyncClassificationPrompt,
      promptInput: {
        novelTitle: novel.title,
        novelSummary: novel.description ?? "",
        novelCharacterJson: JSON.stringify(character, null, 2),
        baseCharacterJson: link?.baseCharacter ? JSON.stringify(baseCharacterToDraft(link.baseCharacter), null, 2) : "",
        currentBaseRevisionJson: link?.baseRevision?.snapshotJson ?? "",
        recentTimelineText: timelines.map((item) => `${item.title}: ${item.content}`).join("\n"),
        userIntent: input.userIntent ?? "判断当前小说角色中哪些设定适合沉淀到角色库。",
      },
      options: {
        provider: input.provider,
        model: input.model,
        temperature: input.temperature ?? 0.2,
      },
    });

    const parsed = characterSyncProposalAiOutputSchema.parse(aiResult.output);
    const payload: CharacterSyncProposalPayload = {
      baseCharacterDraft: parsed.baseCharacterDraft ? sanitizeBaseCharacterDraft(parsed.baseCharacterDraft) : null,
      applyableFields: parsed.safeUpdates.map((item) => item.field),
      warnings: parsed.riskyUpdates.map((item) => item.summary),
      scopeNote: parsed.scopeNote,
    };

    const row = await prisma.characterSyncProposal.create({
      data: {
        novelId: input.novelId,
        characterId: input.characterId,
        baseCharacterId: link?.baseCharacterId ?? character.baseCharacterId ?? null,
        baseRevisionId: link?.baseRevisionId ?? null,
        direction: "novel_to_library",
        status: "pending_review",
        confidence: parsed.confidence,
        summary: parsed.summary,
        payloadJson: toJson(payload),
        safeUpdatesJson: toJson(parsed.safeUpdates),
        novelOnlyUpdatesJson: toJson(parsed.novelOnlyUpdates),
        riskyUpdatesJson: toJson(parsed.riskyUpdates),
        recommendedAction: parsed.recommendedAction,
        sourceType: "ai_character_sync_classification",
      },
    });

    return mapProposal(row);
  }

  async saveNovelCharacterToLibrary(
    novelId: string,
    characterId: string,
    input: NovelCharacterSaveToLibraryInput,
  ) {
    const character = await prisma.character.findFirst({
      where: { id: characterId, novelId },
    });
    if (!character) {
      throw new Error("角色不存在");
    }

    let draft = input.baseCharacter ? sanitizeBaseCharacterDraft(input.baseCharacter) : null;
    let proposalId: string | null = null;
    if (input.proposalId) {
      const proposal = await prisma.characterSyncProposal.findFirst({
        where: {
          id: input.proposalId,
          novelId,
          characterId,
          direction: "novel_to_library",
          status: "pending_review",
        },
      });
      if (!proposal) {
        throw new Error("角色同步提案不存在或已处理。");
      }
      const payload = parseJsonObject(proposal.payloadJson);
      draft = sanitizeBaseCharacterDraft(payload.baseCharacterDraft);
      proposalId = proposal.id;
    }
    if (!draft) {
      throw new Error("缺少可写入角色库的角色设定。");
    }

    const result = await prisma.$transaction(async (tx) => {
      const baseCharacter = await tx.baseCharacter.create({
        data: {
          name: draft.name,
          role: draft.role,
          personality: draft.personality,
          background: draft.background,
          development: draft.development,
          appearance: draft.appearance ?? undefined,
          weaknesses: draft.weaknesses ?? undefined,
          interests: draft.interests ?? undefined,
          keyEvents: draft.keyEvents ?? undefined,
          tags: draft.tags,
          category: draft.category,
        },
      });
      const revision = await tx.baseCharacterRevision.create({
        data: {
          baseCharacterId: baseCharacter.id,
          version: 1,
          snapshotJson: toJson(draft),
          changeSummary: `从小说角色《${character.name}》保存到角色库。`,
          sourceType: "novel_character_export",
          sourceRefId: character.id,
        },
      });
      const updatedCharacter = await tx.character.update({
        where: { id: character.id },
        data: { baseCharacterId: baseCharacter.id },
      });
      const link = await tx.characterLibraryLink.upsert({
        where: { characterId: character.id },
        create: {
          novelId,
          characterId: character.id,
          baseCharacterId: baseCharacter.id,
          baseRevisionId: revision.id,
          syncPolicy: input.syncPolicy,
          linkStatus: input.linkStatus,
          lastSyncedAt: new Date(),
        },
        update: {
          baseCharacterId: baseCharacter.id,
          baseRevisionId: revision.id,
          syncPolicy: input.syncPolicy,
          linkStatus: input.linkStatus,
          lastSyncedAt: new Date(),
        },
      });
      if (proposalId) {
        await tx.characterSyncProposal.update({
          where: { id: proposalId },
          data: {
            status: "applied",
            baseCharacterId: baseCharacter.id,
            baseRevisionId: revision.id,
          },
        });
      }
      return { baseCharacter, revision, character: updatedCharacter, link };
    });

    queueRagUpsert("character", result.character.id);
    return {
      ...result,
      link: mapLink(result.link),
    };
  }

  async importBaseCharacterToNovel(novelId: string, rawInput: ImportBaseCharacterToNovelInput) {
    const input = importBaseCharacterToNovelInputSchema.parse(rawInput);
    const baseCharacter = await prisma.baseCharacter.findUnique({
      where: { id: input.baseCharacterId },
    });
    if (!baseCharacter) {
      throw new Error("基础角色不存在");
    }

    const revision = await this.ensureLatestBaseRevision(baseCharacter.id, "base_character_import");
    const draft = baseCharacterToDraft(baseCharacter);
    const modeConfig = this.resolveImportMode(input.mode);

    const result = await prisma.$transaction(async (tx) => {
      const character = await tx.character.create({
        data: {
          novelId,
          baseCharacterId: baseCharacter.id,
          name: input.overrides.name ?? draft.name,
          role: input.overrides.role ?? draft.role,
          personality: draft.personality,
          background: draft.background,
          development: draft.development,
          storyFunction: input.overrides.storyFunction,
          relationToProtagonist: input.overrides.relationToProtagonist,
          currentState: input.overrides.currentState,
          currentGoal: input.overrides.currentGoal,
        },
      });
      const link = await tx.characterLibraryLink.create({
        data: {
          novelId,
          characterId: character.id,
          baseCharacterId: baseCharacter.id,
          baseRevisionId: revision.id,
          syncPolicy: modeConfig.syncPolicy,
          linkStatus: modeConfig.linkStatus,
          localOverridesJson: toJson(input.overrides),
          lastSyncedAt: modeConfig.linkStatus === "linked" ? new Date() : null,
        },
      });
      return { character, link, baseCharacter, revision };
    });

    queueRagUpsert("character", result.character.id);
    return {
      ...result,
      link: mapLink(result.link),
    };
  }

  async createLibraryUpdateProposals(
    baseCharacterId: string,
    baseRevisionId: string,
    options: { excludeCharacterId?: string | null } = {},
  ): Promise<CharacterSyncProposal[]> {
    const revision = await prisma.baseCharacterRevision.findUnique({
      where: { id: baseRevisionId },
    });
    if (!revision) {
      throw new Error("角色库版本不存在");
    }
    const baseSnapshot = sanitizeBaseCharacterDraft(JSON.parse(revision.snapshotJson) as unknown);
    const links = await prisma.characterLibraryLink.findMany({
      where: {
        baseCharacterId,
        linkStatus: "linked",
        syncPolicy: { not: "locked_instance" },
        ...(options.excludeCharacterId ? { characterId: { not: options.excludeCharacterId } } : {}),
      },
      include: { character: true },
    });

    const rows = [];
    for (const link of links) {
      const existing = await prisma.characterSyncProposal.findFirst({
        where: {
          novelId: link.novelId,
          characterId: link.characterId,
          baseCharacterId,
          baseRevisionId,
          direction: "library_to_novel",
          status: "pending_review",
        },
      });
      if (existing) {
        rows.push(existing);
        continue;
      }
      rows.push(await prisma.characterSyncProposal.create({
        data: {
          novelId: link.novelId,
          characterId: link.characterId,
          baseCharacterId,
          baseRevisionId,
          direction: "library_to_novel",
          status: "pending_review",
          confidence: null,
          summary: `角色库《${baseSnapshot.name}》有新版本，可选择是否应用到《${link.character.name}》。`,
          payloadJson: toJson({
            baseSnapshot,
            applyableFields: [...APPLY_TO_NOVEL_FIELDS],
            warnings: ["应用后只会改变当前小说中的这个角色，不会影响角色库或其他小说。"],
            scopeNote: "这次更新不会自动影响其他小说。",
          }),
          safeUpdatesJson: toJson(buildLibraryUpdateFields(baseSnapshot)),
          novelOnlyUpdatesJson: toJson([]),
          riskyUpdatesJson: toJson([]),
          recommendedAction: "review_before_apply",
          sourceType: "base_character_revision",
          sourceRefId: baseRevisionId,
        },
      }));
    }
    return rows.map(mapProposal);
  }

  async applyProposal(proposalId: string): Promise<CharacterSyncProposal> {
    const proposal = await prisma.characterSyncProposal.findUnique({ where: { id: proposalId } });
    if (!proposal || proposal.status !== "pending_review") {
      throw new Error("角色同步提案不存在或已处理。");
    }

    if (proposal.direction === "library_to_novel") {
      await this.applyLibraryToNovelProposal(proposal);
    } else if (proposal.direction === "novel_to_library") {
      const revision = await this.applyNovelToLibraryProposal(proposal);
      if (proposal.baseCharacterId && proposal.characterId) {
        await this.createLibraryUpdateProposals(proposal.baseCharacterId, revision.id, {
          excludeCharacterId: proposal.characterId,
        });
      }
    } else {
      throw new Error("未知的角色同步方向。");
    }

    const updated = await prisma.characterSyncProposal.findUnique({ where: { id: proposalId } });
    if (!updated) {
      throw new Error("角色同步提案不存在。");
    }
    return mapProposal(updated);
  }

  async ignoreProposal(proposalId: string): Promise<CharacterSyncProposal> {
    const updated = await prisma.characterSyncProposal.update({
      where: { id: proposalId },
      data: { status: "ignored" },
    });
    return mapProposal(updated);
  }

  private resolveImportMode(mode: BaseCharacterImportMode): {
    syncPolicy: CharacterSyncPolicy;
    linkStatus: CharacterLibraryLinkStatus;
  } {
    if (mode === "detached_copy") {
      return { syncPolicy: "locked_instance", linkStatus: "detached" };
    }
    if (mode === "linked") {
      return { syncPolicy: "manual_review", linkStatus: "linked" };
    }
    return { syncPolicy: "manual_review", linkStatus: "linked" };
  }

  private async applyLibraryToNovelProposal(proposal: {
    id: string;
    novelId: string | null;
    characterId: string | null;
    baseRevisionId: string | null;
    payloadJson: string;
  }): Promise<void> {
    if (!proposal.characterId || !proposal.baseRevisionId) {
      throw new Error("同步提案缺少小说角色或角色库版本。");
    }
    const payload = parseJsonObject(proposal.payloadJson);
    const baseSnapshot = sanitizeBaseCharacterDraft(payload.baseSnapshot);
    const data: Partial<Record<ApplyToNovelField, string>> = {};
    for (const field of APPLY_TO_NOVEL_FIELDS) {
      data[field] = baseSnapshot[field];
    }
    await prisma.$transaction(async (tx) => {
      await tx.character.update({
        where: { id: proposal.characterId ?? "" },
        data,
      });
      await tx.characterLibraryLink.update({
        where: { characterId: proposal.characterId ?? "" },
        data: {
          baseRevisionId: proposal.baseRevisionId,
          lastSyncedAt: new Date(),
        },
      });
      await tx.characterSyncProposal.update({
        where: { id: proposal.id },
        data: { status: "applied" },
      });
    });
    queueRagUpsert("character", proposal.characterId);
  }

  private async applyNovelToLibraryProposal(proposal: {
    id: string;
    novelId: string | null;
    characterId: string | null;
    baseCharacterId: string | null;
    payloadJson: string;
    summary: string;
  }): Promise<{ id: string }> {
    if (!proposal.baseCharacterId || !proposal.characterId) {
      throw new Error("更新角色库需要已有角色库角色和小说角色。新建角色库请使用保存到角色库入口。");
    }
    const payload = parseJsonObject(proposal.payloadJson);
    const draft = sanitizeBaseCharacterDraft(payload.baseCharacterDraft);
    const revision = await prisma.$transaction(async (tx) => {
      await tx.baseCharacter.update({
        where: { id: proposal.baseCharacterId ?? "" },
        data: {
          name: draft.name,
          role: draft.role,
          personality: draft.personality,
          background: draft.background,
          development: draft.development,
          appearance: draft.appearance ?? undefined,
          weaknesses: draft.weaknesses ?? undefined,
          interests: draft.interests ?? undefined,
          keyEvents: draft.keyEvents ?? undefined,
          tags: draft.tags,
          category: draft.category,
        },
      });
      const latest = await tx.baseCharacterRevision.findFirst({
        where: { baseCharacterId: proposal.baseCharacterId ?? "" },
        orderBy: { version: "desc" },
      });
      const revision = await tx.baseCharacterRevision.create({
        data: {
          baseCharacterId: proposal.baseCharacterId ?? "",
          version: (latest?.version ?? 0) + 1,
          snapshotJson: toJson(draft),
          changeSummary: proposal.summary,
          sourceType: "novel_character_sync",
          sourceRefId: proposal.characterId,
        },
      });
      await tx.characterLibraryLink.update({
        where: { characterId: proposal.characterId ?? "" },
        data: {
          baseRevisionId: revision.id,
          lastSyncedAt: new Date(),
        },
      });
      await tx.characterSyncProposal.update({
        where: { id: proposal.id },
        data: {
          status: "applied",
          baseRevisionId: revision.id,
        },
      });
      return revision;
    });
    return revision;
  }
}

export const characterLibrarySyncService = new CharacterLibrarySyncService();
