import type { WorldGeographyMapEdge, WorldVisualizationPayload } from "@novelfoundry/shared/types/world";

import { buildWorldBindingSupport, parseWorldStructurePayload } from "../../worldStructure";

import { type VisualizationSource } from "../domain/contracts";

import { normalizeNodeType, MAX_FACTION_NODES, MAX_FACTION_EDGES } from "../domain/factionGraph";

import { inferDirectionFromText, offsetCoordinate, DIRECTION_COORDINATES, inferRegionType, MAX_GEO_NODES, normalizeRouteType } from "../domain/geographyMap";

import { buildPowerTree, MAX_POWER_ITEMS, MAX_TIMELINE_ITEMS, buildTimeline, buildFallbackWorldVisualizationPayload } from "../infrastructure/legacySourceProjection";

export function buildStructuredWorldVisualizationPayload(world: VisualizationSource): WorldVisualizationPayload | null {
  const { structure, hasStructuredData } = parseWorldStructurePayload(world.structureJson, world.bindingSupportJson);
  if (!hasStructuredData) {
    return null;
  }

  const forceNodes = structure.forces.map((item) => ({
    id: item.id,
    label: item.name,
    type: normalizeNodeType(item.type, item.name),
  }));
  const factionNodes = structure.factions
    .filter((item) => !forceNodes.some((force) => force.label === item.name))
    .map((item) => ({
      id: item.id,
      label: item.name,
      type: "faction",
    }));
  const factionNodesMerged = [...forceNodes, ...factionNodes].slice(0, MAX_FACTION_NODES);
  const factionNodeIds = new Set(factionNodesMerged.map((item) => item.id));
  const factionEdges = structure.relations.forceRelations
    .filter((item) => factionNodeIds.has(item.sourceForceId) && factionNodeIds.has(item.targetForceId))
    .map((item) => ({
      source: item.sourceForceId,
      target: item.targetForceId,
      relation: item.relation || "关联",
    }))
    .slice(0, MAX_FACTION_EDGES);

  const geographyNodes = structure.locations
    .map((item, index) => {
      const directionHint = inferDirectionFromText(
        [item.name, item.terrain, item.summary, item.narrativeFunction, item.risk].join(" "),
        index,
      );
      const point = offsetCoordinate(DIRECTION_COORDINATES[directionHint], index);
      return {
        id: item.id,
        label: item.name,
        x: item.x ?? point.x,
        y: item.y ?? point.y,
        directionHint: item.directionHint ?? directionHint,
        regionType: inferRegionType([item.name, item.type, item.terrain].filter(Boolean).join(" ")),
        terrain: item.terrain || undefined,
        summary: item.summary || undefined,
        controllingForceIds: item.controllingForceIds,
        risk: item.risk || (item.riskLevel ? `风险等级 ${item.riskLevel}` : undefined),
        storyRelevance: item.storyRelevance || item.narrativeFunction || undefined,
      };
    })
    .slice(0, MAX_GEO_NODES);
  const geographyNodeIdSet = new Set(geographyNodes.map((item) => item.id));
  const forceNameById = new Map(structure.forces.map((item) => [item.id, item.name]));
  const explicitLocationEdges = (structure.relations.locationConnections ?? [])
    .filter((item) => geographyNodeIdSet.has(item.sourceLocationId) && geographyNodeIdSet.has(item.targetLocationId))
    .map((item) => ({
      source: item.sourceLocationId,
      target: item.targetLocationId,
      relation: item.connectionType || "相邻",
      routeType: normalizeRouteType(item.connectionType, item.connectionType),
      distanceHint: item.distanceHint || undefined,
      risk: item.narrativeUse || undefined,
    }));
  const geographyEdges = explicitLocationEdges.length > 0 ? explicitLocationEdges : structure.relations.locationControls
    .filter((item) => geographyNodeIdSet.has(item.locationId))
    .reduce<WorldGeographyMapEdge[]>((acc, relation, index, list) => {
      const sibling = list.find(
        (candidate, siblingIndex) =>
          siblingIndex > index
          && candidate.forceId === relation.forceId
          && candidate.locationId !== relation.locationId
          && geographyNodeIdSet.has(candidate.locationId),
      );
      if (!sibling) {
        return acc;
      }
      acc.push({
        source: relation.locationId,
        target: sibling.locationId,
        relation: `${forceNameById.get(relation.forceId) ?? relation.forceId}${relation.relation ? `:${relation.relation}` : "控制"}`,
        routeType: "border",
      });
      return acc;
    }, [])
    .slice(0, MAX_FACTION_EDGES);

  const powerTree = (
    structure.rules.axioms.length > 0
      ? structure.rules.axioms.map((item, index) => ({
        level: `R${index + 1}`,
        description: [item.name, item.summary].filter(Boolean).join("："),
      }))
      : buildPowerTree(world)
  ).slice(0, MAX_POWER_ITEMS);

  const bindingSupport = buildWorldBindingSupport(structure);
  const timeline = bindingSupport.compatibleConflicts.length > 0
    ? bindingSupport.compatibleConflicts.slice(0, MAX_TIMELINE_ITEMS).map((item, index) => ({
      year: `阶段${index + 1}`,
      event: item,
    }))
    : buildTimeline(world);

  if (factionNodesMerged.length === 0 && geographyNodes.length === 0) {
    return null;
  }

  const fallback = buildFallbackWorldVisualizationPayload(world);
  const shouldUseFallbackFactions = factionNodesMerged.length === 0;
  const shouldUseFallbackGeography = geographyNodes.length === 0;

  return {
    worldId: world.id,
    factionGraph: {
      nodes: shouldUseFallbackFactions ? fallback.factionGraph.nodes : factionNodesMerged,
      edges: shouldUseFallbackFactions ? fallback.factionGraph.edges : factionEdges,
    },
    powerTree,
    geographyMap: {
      nodes: shouldUseFallbackGeography ? fallback.geographyMap.nodes : geographyNodes,
      edges: shouldUseFallbackGeography ? fallback.geographyMap.edges : geographyEdges,
    },
    timeline,
  };
}
