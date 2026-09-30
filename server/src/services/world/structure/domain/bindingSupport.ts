import type { WorldBindingLocationCluster, WorldBindingSupport, WorldStructuredData } from "@novelfoundry/shared/types/world";
import { createEmptyWorldBindingSupport } from "./emptyStructure";
import {
  normalizeText,
  normalizeStringArray,
  normalizeRecord,
  makeId,
} from "./fieldNormalization";

function normalizeLocationClusters(raw: unknown): WorldBindingLocationCluster[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item, index) => {
      const record = normalizeRecord(item);
      const label = normalizeText(record.label ?? record.name ?? record.title);
      if (!label) {
        return null;
      }
      return {
        id: normalizeText(record.id) || makeId("cluster", index, label),
        label,
        locationIds: normalizeStringArray(record.locationIds ?? record.locations),
        reason: normalizeText(record.reason ?? record.summary ?? record.description),
      } satisfies WorldBindingLocationCluster;
    })
    .filter((item): item is WorldBindingLocationCluster => Boolean(item));
}

export function normalizeWorldBindingSupport(
  raw: unknown,
  fallback = createEmptyWorldBindingSupport(),
): WorldBindingSupport {
  const record = normalizeRecord(raw);
  return {
    recommendedEntryPoints: normalizeStringArray(
      record.recommendedEntryPoints ?? fallback.recommendedEntryPoints,
    ).slice(0, 6),
    highPressureForces: normalizeStringArray(
      record.highPressureForces ?? fallback.highPressureForces,
    ).slice(0, 6),
    suggestedLocationClusters: normalizeLocationClusters(
      record.suggestedLocationClusters ?? fallback.suggestedLocationClusters,
    ).slice(0, 4),
    compatibleConflicts: normalizeStringArray(
      record.compatibleConflicts ?? fallback.compatibleConflicts,
    ).slice(0, 8),
    forbiddenCombinations: normalizeStringArray(
      record.forbiddenCombinations ?? fallback.forbiddenCombinations,
    ).slice(0, 8),
  };
}

export function buildWorldBindingSupport(structure: WorldStructuredData): WorldBindingSupport {
  const recommendedEntryPoints = Array.from(
    new Set(
      [
        ...structure.locations
          .filter((item) => item.narrativeFunction || item.summary)
          .slice(0, 3)
          .map((item) => `${item.name}${item.narrativeFunction ? `：${item.narrativeFunction}` : ""}`),
        ...structure.forces
          .filter((item) => item.narrativeRole || item.summary)
          .slice(0, 3)
          .map((item) => `${item.name}${item.narrativeRole ? `：${item.narrativeRole}` : ""}`),
      ].filter(Boolean),
    ),
  ).slice(0, 6);

  const highPressureForces = structure.forces
    .filter((item) => item.pressure)
    .map((item) => `${item.name}：${item.pressure}`)
    .slice(0, 6);

  const suggestedLocationClusters = structure.locations
    .slice(0, 3)
    .map((item, index) => ({
      id: makeId("cluster", index, item.name),
      label: `${item.name} 场景群`,
      locationIds: [item.id],
      reason: item.narrativeFunction || item.summary || item.risk,
    }));

  const compatibleConflicts = Array.from(
    new Set(
      structure.relations.forceRelations
        .map((item) => item.detail || item.tension || `${item.sourceForceId} ${item.relation} ${item.targetForceId}`)
        .filter(Boolean),
    ),
  ).slice(0, 8);

  const forbiddenCombinations = [
    ...structure.rules.taboo,
    ...structure.rules.sharedConsequences.map((item) => `避免忽略：${item}`),
  ].slice(0, 8);

  return {
    recommendedEntryPoints,
    highPressureForces,
    suggestedLocationClusters,
    compatibleConflicts,
    forbiddenCombinations,
  };
}
