import { prisma } from "../../../../../db/prisma";

import { buildCharacterCastContextBlocks } from "../../../../../prompting/prompts/novel/characterPreparation.contextBlocks";

import { buildStoryModePromptBlock, normalizeStoryModeOutput } from "../../../../storyMode/storyModeProfile";

import { WorldContextGateway } from "../../../worldContext/WorldContextGateway";

import { type CharacterPrepOptions } from "./contracts";

export abstract class CharacterCastContextService {
  protected abstract readonly worldContextGateway: WorldContextGateway;
  protected async loadCastGenerationContext(novelId: string, options: CharacterPrepOptions) {
    const novel = await prisma.novel.findUnique({
      where: { id: novelId },
      include: {
        genre: { select: { name: true } },
        bible: {
          select: {
            coreSetting: true,
            mainPromise: true,
            characterArcs: true,
          },
        },
        storyMacroPlan: {
          select: {
            storyInput: true,
            decompositionJson: true,
            constraintEngineJson: true,
          },
        },
        bookContract: {
          select: {
            readingPromise: true,
            protagonistFantasy: true,
            coreSellingPoint: true,
            chapter3Payoff: true,
            chapter10Payoff: true,
            chapter30Payoff: true,
            escalationLadder: true,
            relationshipMainline: true,
          },
        },
        primaryStoryMode: {
          select: {
            id: true,
            name: true,
            description: true,
            template: true,
            parentId: true,
            profileJson: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        secondaryStoryMode: {
          select: {
            id: true,
            name: true,
            description: true,
            template: true,
            parentId: true,
            profileJson: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        characters: {
          select: {
            name: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!novel) {
      throw new Error("Novel not found.");
    }

    const storyInput = options.storyInput?.trim()
      || novel.storyMacroPlan?.storyInput?.trim()
      || novel.description?.trim()
      || "";
    const worldContext = options.useWorldContext === false
      ? null
      : await this.worldContextGateway.getWorldContextBlock(novelId, {
        purpose: "character",
        strength: "normal",
        storyInput,
        provider: options.provider,
        model: options.model,
        temperature: options.temperature,
      });
    const storyModeBlock = buildStoryModePromptBlock({
      primary: novel.primaryStoryMode ? normalizeStoryModeOutput(novel.primaryStoryMode) : null,
      secondary: novel.secondaryStoryMode ? normalizeStoryModeOutput(novel.secondaryStoryMode) : null,
    });
    const contextBlocks = buildCharacterCastContextBlocks({
      projectTitle: novel.title,
      storyInput: storyInput || "暂无直接故事输入，请结合书级约束补齐真实可入戏角色。",
      genreName: novel.genre?.name ?? null,
      storyModeBlock,
      styleTone: novel.styleTone ?? null,
      narrativePov: novel.narrativePov ?? null,
      pacePreference: novel.pacePreference ?? null,
      emotionIntensity: novel.emotionIntensity ?? null,
      corePromise: novel.bible?.mainPromise ?? null,
      coreSetting: novel.bible?.coreSetting ?? null,
      characterArcs: novel.bible?.characterArcs ?? null,
      worldRules: worldContext?.worldRulesText ?? null,
      worldStage: worldContext?.worldStageText ?? null,
      worldFocusHints: options.useWorldContext === false ? null : options.worldFocusHints,
      storyDecomposition: novel.storyMacroPlan?.decompositionJson ?? null,
      constraintEngine: novel.storyMacroPlan?.constraintEngineJson ?? null,
      bookContract: novel.bookContract,
      existingCharacterNames: novel.characters.map((character) => character.name),
    });

    return {
      novel,
      storyInput,
      contextBlocks,
    };
  }
}
