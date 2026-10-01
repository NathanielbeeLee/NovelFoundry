import type { LLMProvider } from "@novelfoundry/shared/types/llm";

import type { WorldConsistencyReport, WorldLayerKey, WorldVisualizationPayload } from "@novelfoundry/shared/types/world";

import { prisma } from "../../../../db/prisma";

import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";

import { worldAxiomSuggestionPrompt } from "../../../../prompting/prompts/world/world.prompts";

import { getTemplateByKey, LAYER_FIELD_MAP, WORLD_LAYER_ORDER } from "../../worldTemplates";

import { applyStructuredWorldToLegacyFields, buildStructuredRulesFromAxiomTexts, buildWorldBindingSupport, buildWorldStructureSeedFromSource, normalizeWorldStructuredData, parseWorldStructurePayload } from "../../worldStructure";

import { applyGeneratedWorldFields, buildWorldBlueprintPromptBlock } from "../../worldGenerationBlueprint";

import { createWorldDraftGenerateStream, createWorldDraftRefineStream } from "../../worldDraftGeneration";

import { analyzeWorldInspiration } from "../../worldInspirationService";

import { answerWorldDeepeningQuestions, checkWorldConsistency, createWorldDeepeningQuestions, updateWorldConsistencyIssueStatus } from "../../worldImprovementService";

import { buildWorldLayerGeneration } from "../../worldLayerGeneration";

import { backfillWorldStructure, generateWorldStructure, getWorldOverview, getWorldStructure, getWorldVisualization, updateWorldStructure } from "../../worldStructureWorkspace";

import { type DeepeningAnswerInput, type ImportWorldInput, type InspirationInput, type LayerGenerateInput, type LayerUpdateInput, type LibraryUseInput, type RefineWorldInput, type StructureBackfillInput, type StructureGenerateInput, type StructureUpdateInput, type WorldGenerateInput, type WorldTextField, markDownstreamStale, normalizeAxiomList, normalizeLayerStates, nowISO } from "../../worldServiceShared";

import { generateWorldSkeleton, type WorldSkeletonGenerateInput } from "../../worldSkeletonGeneration";

import { exportWorldData, importWorldData } from "../../worldTransfer";

import { WorldPersistenceService } from "../infrastructure/WorldPersistenceService";

import { hasReliableStructuredLayerSource, pickGeneratedLayerFields, buildGeneratedStructurePersistence, buildGeneratedLayersFromStructuredFields } from "../domain/generatedLayers";

export class WorldService extends WorldPersistenceService {
  async analyzeInspiration(input: InspirationInput, onProgress?: (message: string) => void) {
    return analyzeWorldInspiration(input, onProgress);
  }

  async generateSkeleton(input: WorldSkeletonGenerateInput) {
    return generateWorldSkeleton(input);
  }

  async suggestAxioms(
    worldId: string,
    options: { provider?: LLMProvider; model?: string },
  ) {
    const world = await prisma.world.findUnique({ where: { id: worldId } });
    if (!world) {
      throw new Error("World not found.");
    }

    const template = getTemplateByKey(world.templateKey);
    const blueprintPromptBlock = buildWorldBlueprintPromptBlock(world);
    const result = await runStructuredPrompt({
      asset: worldAxiomSuggestionPrompt,
      promptInput: {
        worldName: world.name,
        worldType: world.worldType ?? "未知",
        templateName: template.name,
        templateDescription: template.description,
        description: world.description ?? "无",
        blueprintPromptBlock,
      },
      options: {
        provider: options.provider ?? "deepseek",
        model: options.model,
        temperature: 0.5,
      },
    });
    const axioms = normalizeAxiomList(result.output);
    return axioms.length > 0
      ? axioms
      : [
        "力量必须支付可衡量的代价。",
        "任何规则突破都必须留下可追溯机制。",
        "政治秩序受资源流动约束。",
        "核心冲突必须源于世界规则而非偶然。",
        "任何角色都不能直接违背基础公理。",
      ];
  }

  async updateAxioms(worldId: string, axioms: string[]) {
    const world = await prisma.world.findUnique({ where: { id: worldId } });
    if (!world) {
      throw new Error("World not found.");
    }

    const parsed = parseWorldStructurePayload(world.structureJson, world.bindingSupportJson);
    const nextStructure = {
      ...parsed.structure,
      rules: {
        ...parsed.structure.rules,
        axioms: buildStructuredRulesFromAxiomTexts(axioms),
      },
      metadata: {
        ...parsed.structure.metadata,
        lastGeneratedAt: nowISO(),
      },
    };
    const nextBindingSupport = buildWorldBindingSupport(nextStructure);
    const structuredFields = applyStructuredWorldToLegacyFields(nextStructure, world, nextBindingSupport);

    const updated = await prisma.world.update({
      where: { id: worldId },
      data: {
        ...structuredFields,
        axioms: JSON.stringify(axioms),
        version: { increment: 1 },
      },
    });
    await this.createSnapshot(worldId, "axioms-updated");
    this.queueRagUpsert("world", worldId);
    return updated;
  }

  async generateLayer(worldId: string, layerKey: WorldLayerKey, input: LayerGenerateInput) {
    const world = await prisma.world.findUnique({ where: { id: worldId } });
    if (!world) {
      throw new Error("World not found.");
    }

    const parsedStructure = parseWorldStructurePayload(world.structureJson, world.bindingSupportJson);
    if (hasReliableStructuredLayerSource(parsedStructure)) {
      const structuredFields = applyStructuredWorldToLegacyFields(
        parsedStructure.structure,
        world,
        parsedStructure.bindingSupport,
      );
      const generated = pickGeneratedLayerFields(structuredFields, layerKey);
      if (Object.keys(generated).length > 0) {
        const states = normalizeLayerStates(world.layerStates);
        states[layerKey] = { key: layerKey, status: "generated", updatedAt: nowISO() };
        markDownstreamStale(states, layerKey);

        const updated = await prisma.world.update({
          where: { id: worldId },
          data: {
            status: "refining",
            layerStates: JSON.stringify(states),
            ...structuredFields,
          },
        });
        await this.createSnapshot(worldId, `${layerKey}-structured-layer`);
        this.queueRagUpsert("world", worldId);

        return {
          world: updated,
          layerKey,
          generated,
          layerStates: states,
        };
      }
    }

    const generated = await buildWorldLayerGeneration({
      provider: input.provider ?? "deepseek",
      model: input.model,
      temperature: input.temperature ?? 0.7,
    }, world, layerKey);

    const states = normalizeLayerStates(world.layerStates);
    states[layerKey] = { key: layerKey, status: "generated", updatedAt: nowISO() };
    markDownstreamStale(states, layerKey);

    const updated = await prisma.world.update({
      where: { id: worldId },
      data: {
        status: "refining",
        layerStates: JSON.stringify(states),
        ...buildGeneratedStructurePersistence(applyGeneratedWorldFields(world, generated)),
        ...generated,
      },
    });
    await this.createSnapshot(worldId, `${layerKey}-generated`);
    this.queueRagUpsert("world", worldId);

    return {
      world: updated,
      layerKey,
      generated,
      layerStates: states,
    };
  }

  async generateAllLayers(worldId: string, input: LayerGenerateInput) {
    const world = await prisma.world.findUnique({ where: { id: worldId } });
    if (!world) {
      throw new Error("World not found.");
    }

    const parsedStructure = parseWorldStructurePayload(world.structureJson, world.bindingSupportJson);
    if (hasReliableStructuredLayerSource(parsedStructure)) {
      const structuredFields = applyStructuredWorldToLegacyFields(
        parsedStructure.structure,
        world,
        parsedStructure.bindingSupport,
      );
      const generatedByLayer = buildGeneratedLayersFromStructuredFields(structuredFields);

      const states = normalizeLayerStates(world.layerStates);
      const updatedAt = nowISO();
      for (const layerKey of WORLD_LAYER_ORDER) {
        states[layerKey] = { key: layerKey, status: "generated", updatedAt };
      }

      const updated = await prisma.world.update({
        where: { id: worldId },
        data: {
          status: "refining",
          layerStates: JSON.stringify(states),
          ...structuredFields,
        },
      });
      await this.createSnapshot(worldId, "structured-layers-generated-all");
      this.queueRagUpsert("world", worldId);

      return {
        world: updated,
        generated: generatedByLayer,
        layerStates: states,
      };
    }

    const generatedByLayer = WORLD_LAYER_ORDER.reduce((acc, layerKey) => {
      acc[layerKey] = {};
      return acc;
    }, {} as Record<WorldLayerKey, Partial<Record<WorldTextField, string>>>);
    const mergedGenerated: Partial<Record<WorldTextField, string>> = {};

    let workingWorld = world;
    for (const layerKey of WORLD_LAYER_ORDER) {
      const generatedLayer = await buildWorldLayerGeneration({
        provider: input.provider ?? "deepseek",
        model: input.model,
        temperature: input.temperature ?? 0.7,
      }, workingWorld, layerKey);
      generatedByLayer[layerKey] = generatedLayer;
      Object.assign(mergedGenerated, generatedLayer);
      workingWorld = applyGeneratedWorldFields(workingWorld, generatedLayer);
    }

    const states = normalizeLayerStates(world.layerStates);
    const updatedAt = nowISO();
    for (const layerKey of WORLD_LAYER_ORDER) {
      states[layerKey] = { key: layerKey, status: "generated", updatedAt };
    }

    const updated = await prisma.world.update({
      where: { id: worldId },
      data: {
        status: "refining",
        layerStates: JSON.stringify(states),
        ...buildGeneratedStructurePersistence(applyGeneratedWorldFields(world, mergedGenerated)),
        ...mergedGenerated,
      },
    });
    await this.createSnapshot(worldId, "layers-generated-all");
    this.queueRagUpsert("world", worldId);

    return {
      world: updated,
      generated: generatedByLayer,
      layerStates: states,
    };
  }

  async updateLayer(worldId: string, layerKey: WorldLayerKey, input: LayerUpdateInput) {
    const world = await prisma.world.findUnique({ where: { id: worldId } });
    if (!world) {
      throw new Error("World not found.");
    }

    const field = LAYER_FIELD_MAP[layerKey][0];
    const states = normalizeLayerStates(world.layerStates);
    states[layerKey] = { key: layerKey, status: "generated", updatedAt: nowISO() };
    markDownstreamStale(states, layerKey);

    const updated = await prisma.world.update({
      where: { id: worldId },
      data: {
        [field]: input.content,
        layerStates: JSON.stringify(states),
      },
    });
    await this.createSnapshot(worldId, `${layerKey}-manual-update`);
    this.queueRagUpsert("world", worldId);
    return updated;
  }

  async confirmLayer(worldId: string, layerKey: WorldLayerKey) {
    const world = await prisma.world.findUnique({ where: { id: worldId } });
    if (!world) {
      throw new Error("World not found.");
    }
    const states = normalizeLayerStates(world.layerStates);
    states[layerKey] = { key: layerKey, status: "confirmed", updatedAt: nowISO() };
    const allConfirmed = WORLD_LAYER_ORDER.every((key) => states[key].status === "confirmed");

    const updated = await prisma.world.update({
      where: { id: worldId },
      data: {
        layerStates: JSON.stringify(states),
        status: allConfirmed ? "finalized" : "refining",
        version: { increment: 1 },
      },
    });
    await this.createSnapshot(worldId, `${layerKey}-confirmed`);
    this.queueRagUpsert("world", worldId);
    return updated;
  }

  async createDeepeningQuestions(
    worldId: string,
    options: { provider?: LLMProvider; model?: string },
  ) {
    return createWorldDeepeningQuestions(worldId, options);
  }

  async answerDeepeningQuestions(worldId: string, answers: DeepeningAnswerInput[]) {
    return answerWorldDeepeningQuestions(worldId, answers, {
      createSnapshot: (id, label) => this.createSnapshot(id, label),
      queueWorldUpsert: (id) => this.queueRagUpsert("world", id),
    });
  }

  async checkConsistency(
    worldId: string,
    options: { provider?: LLMProvider; model?: string } = {},
  ): Promise<WorldConsistencyReport> {
    return checkWorldConsistency(worldId, options, {
      createSnapshot: (id, label) => this.createSnapshot(id, label),
      queueWorldUpsert: (id) => this.queueRagUpsert("world", id),
    });
  }

  async updateConsistencyIssueStatus(
    worldId: string,
    issueId: string,
    status: "open" | "resolved" | "ignored",
  ) {
    return updateWorldConsistencyIssueStatus(worldId, issueId, status);
  }

  async getOverview(worldId: string) {
    return getWorldOverview(worldId, {
      queueWorldUpsert: (id) => this.queueRagUpsert("world", id),
    });
  }

  async getStructure(worldId: string) {
    return getWorldStructure(worldId);
  }

  async updateStructure(worldId: string, input: StructureUpdateInput) {
    return updateWorldStructure(worldId, input, {
      createSnapshot: (id, label) => this.createSnapshot(id, label),
      queueWorldUpsert: (id) => this.queueRagUpsert("world", id),
    });
  }

  async backfillStructure(worldId: string, options: StructureBackfillInput) {
    return backfillWorldStructure(worldId, options, {
      createSnapshot: (id, label) => this.createSnapshot(id, label),
      queueWorldUpsert: (id) => this.queueRagUpsert("world", id),
    });
  }

  async generateStructure(worldId: string, input: StructureGenerateInput) {
    return generateWorldStructure(worldId, input);
  }

  async getVisualization(worldId: string): Promise<WorldVisualizationPayload> {
    return getWorldVisualization(worldId);
  }

  async listLibrary(query: { category?: string; worldType?: string; keyword?: string; limit?: number }) {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    return prisma.worldPropertyLibrary.findMany({
      where: {
        ...(query.category ? { category: query.category } : {}),
        ...(query.worldType ? { worldType: query.worldType } : {}),
        ...(query.keyword
          ? {
            OR: [
              { name: { contains: query.keyword } },
              { description: { contains: query.keyword } },
            ],
          }
          : {}),
      },
      orderBy: [{ usageCount: "desc" }, { updatedAt: "desc" }],
      take: limit,
    });
  }

  async createLibraryItem(input: {
    name: string;
    description?: string;
    category: string;
    worldType?: string;
    sourceWorldId?: string;
  }) {
    const created = await prisma.worldPropertyLibrary.create({
      data: input,
    });
    this.queueRagUpsert("world_library_item", created.id);
    return created;
  }

  async useLibraryItem(itemId: string, input: LibraryUseInput) {
    const item = await prisma.worldPropertyLibrary.findUnique({ where: { id: itemId } });
    if (!item) {
      throw new Error("Library item not found.");
    }

    await prisma.worldPropertyLibrary.update({
      where: { id: itemId },
      data: { usageCount: { increment: 1 } },
    });
    this.queueRagUpsert("world_library_item", itemId);

    if (input.worldId && input.targetCollection) {
      const world = await prisma.world.findUnique({ where: { id: input.worldId } });
      if (!world) {
        throw new Error("Target world not found.");
      }
      const parsed = parseWorldStructurePayload(world.structureJson, world.bindingSupportJson);
      const baseStructure = parsed.hasStructuredData ? parsed.structure : buildWorldStructureSeedFromSource(world);
      const nextStructure = normalizeWorldStructuredData({
        ...baseStructure,
        forces: input.targetCollection === "forces"
          ? [
            ...baseStructure.forces,
            {
              id: `force-library-${item.id}`,
              name: item.name,
              type: item.category,
              factionId: null,
              summary: item.description ?? "",
              baseOfPower: "",
              currentObjective: "",
              pressure: "",
              leader: null,
              narrativeRole: "素材库注入",
            },
          ]
          : baseStructure.forces,
        locations: input.targetCollection === "locations"
          ? [
            ...baseStructure.locations,
            {
              id: `location-library-${item.id}`,
              name: item.name,
              terrain: item.category,
              summary: item.description ?? "",
              narrativeFunction: "素材库注入",
              risk: "",
              entryConstraint: "",
              exitCost: "",
              controllingForceIds: [],
            },
          ]
          : baseStructure.locations,
      }, baseStructure);
      const nextBindingSupport = buildWorldBindingSupport(nextStructure);
      const structuredFields = applyStructuredWorldToLegacyFields(nextStructure, world, nextBindingSupport);
      await prisma.world.update({
        where: { id: input.worldId },
        data: structuredFields,
      });
      await this.createSnapshot(input.worldId, `library-use-${item.name}`);
      this.queueRagUpsert("world", input.worldId);
      return {
        itemId,
        injected: true,
        worldId: input.worldId,
        targetCollection: input.targetCollection,
      };
    }

    if (input.worldId && input.targetField) {
      const world = await prisma.world.findUnique({ where: { id: input.worldId } });
      if (!world) {
        throw new Error("Target world not found.");
      }
      const existing = world[input.targetField] ?? "";
      await prisma.world.update({
        where: { id: input.worldId },
        data: {
          [input.targetField]: `${existing}\n- ${item.name}: ${item.description ?? ""}`.trim(),
        },
      });
      await this.createSnapshot(input.worldId, `library-use-${item.name}`);
      this.queueRagUpsert("world", input.worldId);
      return { itemId, injected: true, worldId: input.worldId, targetCollection: null };
    }
    return { itemId, injected: false, worldId: null, targetCollection: null };
  }

  async exportWorld(worldId: string, format: "markdown" | "json") {
    return exportWorldData(worldId, format);
  }

  async importWorld(input: ImportWorldInput) {
    return importWorldData(input, {
      createSnapshot: (worldId, label) => this.createSnapshot(worldId, label),
      queueRagUpsert: (ownerType, ownerId) => this.queueRagUpsert(ownerType, ownerId),
    });
  }

  async createWorldGenerateStream(input: WorldGenerateInput) {
    return createWorldDraftGenerateStream(input, {
      createSnapshot: (worldId, label) => this.createSnapshot(worldId, label),
      queueRagUpsert: (ownerType, ownerId) => this.queueRagUpsert(ownerType, ownerId),
    });
  }

  async createRefineStream(worldId: string, input: RefineWorldInput) {
    return createWorldDraftRefineStream(worldId, input, {
      createSnapshot: (id, label) => this.createSnapshot(id, label),
      queueRagUpsert: (ownerType, ownerId) => this.queueRagUpsert(ownerType, ownerId),
    });
  }
}
