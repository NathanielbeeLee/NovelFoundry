import type {
  WorldBindingSupport,
  WorldForceRelation,
  WorldLocationConnectionRelation,
  WorldLocationControlRelation,
  WorldProfile,
  WorldRules,
  WorldStructuredData,
} from "@novelfoundry/shared/types/world";

export const WORLD_STRUCTURE_SCHEMA_VERSION = 1;

export function createEmptyWorldProfile(): WorldProfile {
  return {
    summary: "",
    identity: "",
    tone: "",
    themes: [],
    coreConflict: "",
  };
}

export function createEmptyWorldRules(): WorldRules {
  return {
    summary: "",
    axioms: [],
    taboo: [],
    sharedConsequences: [],
  };
}

export function createEmptyWorldRelations() {
  return {
    forceRelations: [] as WorldForceRelation[],
    locationControls: [] as WorldLocationControlRelation[],
    locationConnections: [] as WorldLocationConnectionRelation[],
  };
}

export function createEmptyWorldStructure(): WorldStructuredData {
  return {
    profile: createEmptyWorldProfile(),
    rules: createEmptyWorldRules(),
    factions: [],
    forces: [],
    locations: [],
    relations: createEmptyWorldRelations(),
    metadata: {
      schemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
      seededFrom: "empty",
      lastBackfilledAt: null,
      lastGeneratedAt: null,
      lastSectionGenerated: null,
    },
  };
}

export function createEmptyWorldBindingSupport(): WorldBindingSupport {
  return {
    recommendedEntryPoints: [],
    highPressureForces: [],
    suggestedLocationClusters: [],
    compatibleConflicts: [],
    forbiddenCombinations: [],
  };
}
