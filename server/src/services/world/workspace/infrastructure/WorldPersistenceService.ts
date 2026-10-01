import { createWorldSnapshot, diffWorldSnapshots, listWorldSnapshots, restoreWorldSnapshot } from "../../worldSnapshotService";

import { prisma } from "../../../../db/prisma";

import { LAYER_FIELD_MAP, WORLD_LAYER_ORDER, WORLD_TEMPLATES } from "../../worldTemplates";

import { applyStructuredWorldToLegacyFields, buildWorldBindingSupport, buildWorldStructureSeedFromSource, normalizeWorldBindingSupport, normalizeWorldStructuredData, parseWorldStructurePayload, WORLD_STRUCTURE_SCHEMA_VERSION } from "../../worldStructure";

import { type CreateWorldInput, markDownstreamStale, normalizeLayerStates, nowISO, uniqueKnowledgeDocumentIds } from "../../worldServiceShared";

import { ragServices } from "../../../rag";

import type { RagOwnerType } from "../../../rag/types";

import { buildInitialLayerStatesFromFields, markGeneratedLayerStatesFromFields } from "../domain/generatedLayers";

export class WorldPersistenceService {

  async listWorlds() {
    return prisma.world.findMany({
      orderBy: { updatedAt: "desc" },
    });
  }

  async getTemplates() {
    return WORLD_TEMPLATES;
  }

  protected queueRagUpsert(ownerType: RagOwnerType, ownerId: string): void {
    void ragServices.ragIndexService.enqueueUpsert(ownerType, ownerId).catch(() => {
      // keep primary workflow resilient even when rag queueing fails
    });
  }

  protected queueRagDelete(ownerType: RagOwnerType, ownerId: string): void {
    void ragServices.ragIndexService.enqueueDelete(ownerType, ownerId).catch(() => {
      // keep primary workflow resilient even when rag queueing fails
    });
  }

  async createWorld(input: CreateWorldInput) {
    const knowledgeDocumentIds = uniqueKnowledgeDocumentIds(input.knowledgeDocumentIds);
    if (knowledgeDocumentIds.length > 0) {
      const documents = await prisma.knowledgeDocument.findMany({
        where: {
          id: { in: knowledgeDocumentIds },
          status: { not: "archived" },
        },
        select: { id: true },
      });
      if (documents.length !== knowledgeDocumentIds.length) {
        throw new Error("Some knowledge documents are missing or archived.");
      }
    }

    const seededStructure = input.structure
      ? normalizeWorldStructuredData(input.structure)
      : buildWorldStructureSeedFromSource({
        id: "",
        name: input.name,
        worldType: input.worldType ?? null,
        description: input.description ?? null,
        overviewSummary: null,
        axioms: input.axioms ?? null,
        background: input.background ?? null,
        geography: input.geography ?? null,
        cultures: input.cultures ?? null,
        magicSystem: input.magicSystem ?? null,
        politics: input.politics ?? null,
        races: input.races ?? null,
        religions: input.religions ?? null,
        technology: input.technology ?? null,
        conflicts: input.conflicts ?? null,
        history: input.history ?? null,
        economy: input.economy ?? null,
        factions: input.factions ?? null,
        selectedElements: input.selectedElements ?? null,
        structureJson: null,
        bindingSupportJson: null,
        structureSchemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
      });
    const bindingSupport = input.bindingSupport
      ? normalizeWorldBindingSupport(input.bindingSupport)
      : buildWorldBindingSupport(seededStructure);
    const structuredFields = applyStructuredWorldToLegacyFields(seededStructure, input, bindingSupport);
    const initialLayerStates = buildInitialLayerStatesFromFields({
      ...input,
      ...structuredFields,
    });

    const world = await prisma.world.create({
      data: {
        name: input.name,
        description: (structuredFields.description as string | null | undefined) ?? input.description,
        worldType: input.worldType,
        templateKey: input.templateKey ?? "custom",
        axioms: input.axioms ?? (structuredFields.axioms as string | null | undefined) ?? null,
        background: input.background ?? (structuredFields.background as string | null | undefined) ?? null,
        geography: input.geography ?? (structuredFields.geography as string | null | undefined) ?? null,
        cultures: input.cultures ?? (structuredFields.cultures as string | null | undefined) ?? null,
        magicSystem: input.magicSystem ?? (structuredFields.magicSystem as string | null | undefined) ?? null,
        politics: input.politics ?? (structuredFields.politics as string | null | undefined) ?? null,
        races: input.races,
        religions: input.religions,
        technology: input.technology,
        conflicts: input.conflicts ?? (structuredFields.conflicts as string | null | undefined) ?? null,
        history: input.history ?? (structuredFields.history as string | null | undefined) ?? null,
        economy: input.economy ?? (structuredFields.economy as string | null | undefined) ?? null,
        factions: input.factions ?? (structuredFields.factions as string | null | undefined) ?? null,
        selectedDimensions: input.selectedDimensions,
        selectedElements: input.selectedElements,
        status: "draft",
        layerStates: JSON.stringify(initialLayerStates),
        overviewSummary: (structuredFields.overviewSummary as string | null | undefined) ?? null,
        structureJson: structuredFields.structureJson as string,
        bindingSupportJson: structuredFields.bindingSupportJson as string,
        structureSchemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
      },
    });
    if (knowledgeDocumentIds.length > 0) {
      await prisma.knowledgeBinding.createMany({
        data: knowledgeDocumentIds.map((documentId) => ({
          targetType: "world",
          targetId: world.id,
          documentId,
        })),
      });
    }
    await this.createSnapshot(world.id, "initial-draft");
    this.queueRagUpsert("world", world.id);
    return world;
  }

  async getWorldById(id: string) {
    return prisma.world.findUnique({
      where: { id },
      include: {
        deepeningQA: { orderBy: { createdAt: "desc" } },
        consistencyIssues: { orderBy: [{ status: "asc" }, { severity: "desc" }, { createdAt: "desc" }] },
        snapshots: { orderBy: { createdAt: "desc" }, take: 20 },
      },
    });
  }

  async updateWorld(id: string, input: Partial<CreateWorldInput>) {
    const world = await prisma.world.findUnique({ where: { id } });
    if (!world) {
      throw new Error("World not found.");
    }
    const { structure: _structure, bindingSupport: _bindingSupport, ...legacyInput } = input;

    const states = normalizeLayerStates(world.layerStates);
    for (const layer of WORLD_LAYER_ORDER) {
      const watched = LAYER_FIELD_MAP[layer];
      if (watched.some((field) => typeof legacyInput[field] === "string")) {
        states[layer] = { ...states[layer], status: "generated", updatedAt: nowISO() };
        markDownstreamStale(states, layer);
      }
    }

    let structuredUpdate: Record<string, unknown> = {};
    if (input.structure || input.bindingSupport) {
      const { structure: currentStructure, bindingSupport: currentBindingSupport } = parseWorldStructurePayload(
        world.structureJson,
        world.bindingSupportJson,
      );
      const nextStructure = input.structure
        ? normalizeWorldStructuredData(input.structure, currentStructure)
        : currentStructure;
      const nextBindingSupport = input.bindingSupport
        ? normalizeWorldBindingSupport(input.bindingSupport, currentBindingSupport)
        : buildWorldBindingSupport(nextStructure);
      structuredUpdate = applyStructuredWorldToLegacyFields(nextStructure, world, nextBindingSupport);
      markGeneratedLayerStatesFromFields(states, structuredUpdate);
    }

    const updated = await prisma.world.update({
      where: { id },
      data: {
        ...legacyInput,
        ...structuredUpdate,
        layerStates: JSON.stringify(states),
      },
    });
    this.queueRagUpsert("world", id);
    return updated;
  }

  async deleteWorld(id: string) {
    this.queueRagDelete("world", id);
    await prisma.world.delete({ where: { id } });
  }
  async listSnapshots(worldId: string) {
    return listWorldSnapshots(worldId);
  }

  async createSnapshot(worldId: string, label?: string) {
    return createWorldSnapshot(worldId, label);
  }

  async restoreSnapshot(worldId: string, snapshotId: string) {
    return restoreWorldSnapshot(worldId, snapshotId, {
      queueWorldUpsert: (id) => this.queueRagUpsert("world", id),
    });
  }

  async diffSnapshots(worldId: string, fromId: string, toId: string) {
    return diffWorldSnapshots(worldId, fromId, toId);
  }
}
