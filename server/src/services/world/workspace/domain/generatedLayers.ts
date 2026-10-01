import type { Prisma } from "@prisma/client";

import type { WorldLayerKey, WorldStructuredData } from "@novelfoundry/shared/types/world";

import { LAYER_FIELD_MAP, WORLD_LAYER_ORDER } from "../../worldTemplates";

import { buildWorldBindingSupport, buildWorldStructureFromLegacySource, WORLD_STRUCTURE_SCHEMA_VERSION } from "../../worldStructure";

import { type LayerStateMap, type WorldTextField, normalizeLayerStates, nowISO } from "../../worldServiceShared";

export function buildGeneratedStructurePersistence(
  world: Parameters<typeof buildWorldStructureFromLegacySource>[0],
): Pick<Prisma.WorldUpdateInput, "structureJson" | "bindingSupportJson" | "structureSchemaVersion"> {
  const structure = buildWorldStructureFromLegacySource(world);
  const bindingSupport = buildWorldBindingSupport(structure);
  return {
    structureJson: JSON.stringify({
      ...structure,
      metadata: {
        ...structure.metadata,
        lastGeneratedAt: nowISO(),
      },
    }),
    bindingSupportJson: JSON.stringify(bindingSupport),
    structureSchemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
  };
}

export function markGeneratedLayerStatesFromFields(states: LayerStateMap, fields: Record<string, unknown>): LayerStateMap {
  const updatedAt = nowISO();
  for (const layerKey of WORLD_LAYER_ORDER) {
    const hasLayerText = LAYER_FIELD_MAP[layerKey].some((field) => {
      const value = fields[field];
      return typeof value === "string" && value.trim().length > 0;
    });
    if (hasLayerText && states[layerKey].status !== "confirmed") {
      states[layerKey] = { key: layerKey, status: "generated", updatedAt };
    }
  }
  return states;
}

export function buildInitialLayerStatesFromFields(fields: Record<string, unknown>): LayerStateMap {
  return markGeneratedLayerStatesFromFields(normalizeLayerStates(undefined), fields);
}

export function pickGeneratedLayerFields(
  fields: Record<string, unknown>,
  layerKey: WorldLayerKey,
): Partial<Record<WorldTextField, string>> {
  const generated: Partial<Record<WorldTextField, string>> = {};
  for (const field of LAYER_FIELD_MAP[layerKey]) {
    const value = fields[field];
    if (typeof value === "string" && value.trim()) {
      generated[field] = value.trim();
    }
  }
  return generated;
}

export function buildGeneratedLayersFromStructuredFields(
  fields: Record<string, unknown>,
): Record<WorldLayerKey, Partial<Record<WorldTextField, string>>> {
  return WORLD_LAYER_ORDER.reduce((acc, layerKey) => {
    acc[layerKey] = pickGeneratedLayerFields(fields, layerKey);
    return acc;
  }, {} as Record<WorldLayerKey, Partial<Record<WorldTextField, string>>>);
}

export function hasReliableStructuredLayerSource(parsed: {
  hasStructuredData: boolean;
  structure: WorldStructuredData;
}): boolean {
  if (!parsed.hasStructuredData) {
    return false;
  }
  if (parsed.structure.metadata.seededFrom === "legacy-text") {
    return false;
  }
  return parsed.structure.forces.length > 0
    || parsed.structure.locations.length > 0
    || parsed.structure.rules.axioms.length > 0;
}
