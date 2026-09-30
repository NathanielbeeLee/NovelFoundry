import type {
  WorldFaction,
  WorldForce,
  WorldForceRelation,
  WorldLocation,
  WorldLocationConnectionRelation,
  WorldLocationControlRelation,
  WorldStructuredData,
  WorldStructureSectionKey,
} from "@novelfoundry/shared/types/world";
import { WORLD_STRUCTURE_SCHEMA_VERSION, createEmptyWorldStructure } from "./emptyStructure";
import {
  normalizeProfile,
  normalizeRules,
  normalizeFaction,
  normalizeForce,
  normalizeLocation,
  normalizeForceRelation,
  normalizeLocationControl,
  normalizeLocationConnection,
} from "./entities";
import { normalizeText, normalizeRecord, dedupeById } from "./fieldNormalization";

export function normalizeWorldStructuredData(
  raw: unknown,
  fallback = createEmptyWorldStructure(),
): WorldStructuredData {
  const record = normalizeRecord(raw);
  const factions = Array.isArray(record.factions)
    ? dedupeById(record.factions.map(normalizeFaction).filter((item): item is WorldFaction => Boolean(item)))
    : fallback.factions;
  const forces = Array.isArray(record.forces)
    ? dedupeById(record.forces.map(normalizeForce).filter((item): item is WorldForce => Boolean(item)))
    : fallback.forces;
  const locations = Array.isArray(record.locations)
    ? dedupeById(record.locations.map(normalizeLocation).filter((item): item is WorldLocation => Boolean(item)))
    : fallback.locations;
  const relationsRecord = normalizeRecord(record.relations);
  const forceIds = new Set(forces.map((item) => item.id));
  const locationIds = new Set(locations.map((item) => item.id));
  const rawForceRelations = Array.isArray(relationsRecord.forceRelations)
    ? relationsRecord.forceRelations
    : Array.isArray(relationsRecord.factionRelations)
      ? relationsRecord.factionRelations
      : null;
  const forceRelations = Array.isArray(rawForceRelations)
    ? rawForceRelations
      .map((item, index) => normalizeForceRelation(item, index))
      .filter(
        (item): item is WorldForceRelation =>
          item !== null && forceIds.has(item.sourceForceId) && forceIds.has(item.targetForceId),
      )
    : fallback.relations.forceRelations;
  const rawLocationControls = Array.isArray(relationsRecord.locationControls)
    ? relationsRecord.locationControls
    : Array.isArray(relationsRecord.locationRelations)
      ? relationsRecord.locationRelations
      : null;
  const locationControls = Array.isArray(rawLocationControls)
    ? rawLocationControls
      .map((item, index) => normalizeLocationControl(item, index))
      .filter(
        (item): item is WorldLocationControlRelation =>
          item !== null && forceIds.has(item.forceId) && locationIds.has(item.locationId),
      )
    : fallback.relations.locationControls;
  const rawLocationConnections = Array.isArray(relationsRecord.locationConnections)
    ? relationsRecord.locationConnections
    : Array.isArray(relationsRecord.locationEdges)
      ? relationsRecord.locationEdges
      : null;
  const locationConnections = Array.isArray(rawLocationConnections)
    ? rawLocationConnections
      .map((item, index) => normalizeLocationConnection(item, index))
      .filter(
        (item): item is WorldLocationConnectionRelation =>
          item !== null && locationIds.has(item.sourceLocationId) && locationIds.has(item.targetLocationId),
      )
    : fallback.relations.locationConnections ?? [];
  const sanitizedFactions = factions.map((item) => ({
    ...item,
    representativeForceIds: item.representativeForceIds.filter((id) => forceIds.has(id)),
  }));
  const sanitizedForces = forces.map((item) => ({
    ...item,
    controlledLocationIds: (item.controlledLocationIds ?? []).filter((id) => locationIds.has(id)),
  }));
  const sanitizedLocations = locations.map((item) => ({
    ...item,
    controllingForceIds: item.controllingForceIds.filter((id) => forceIds.has(id)),
  }));

  return {
    profile: normalizeProfile(record.profile, fallback.profile),
    rules: normalizeRules(record.rules, fallback.rules),
    factions: sanitizedFactions,
    forces: sanitizedForces,
    locations: sanitizedLocations,
    relations: {
      forceRelations: dedupeById(forceRelations),
      locationControls: dedupeById(locationControls),
      locationConnections: dedupeById(locationConnections),
    },
    metadata: {
      schemaVersion:
        Number(record.metadata && normalizeRecord(record.metadata).schemaVersion)
        || fallback.metadata.schemaVersion
        || WORLD_STRUCTURE_SCHEMA_VERSION,
      seededFrom: normalizeText(normalizeRecord(record.metadata).seededFrom, fallback.metadata.seededFrom ?? "") || null,
      lastBackfilledAt:
        normalizeText(normalizeRecord(record.metadata).lastBackfilledAt, fallback.metadata.lastBackfilledAt ?? "")
        || null,
      lastGeneratedAt:
        normalizeText(normalizeRecord(record.metadata).lastGeneratedAt, fallback.metadata.lastGeneratedAt ?? "")
        || null,
      lastSectionGenerated:
        (normalizeText(
          normalizeRecord(record.metadata).lastSectionGenerated,
          fallback.metadata.lastSectionGenerated ?? "",
        ) as WorldStructureSectionKey)
        || null,
    },
  };
}
