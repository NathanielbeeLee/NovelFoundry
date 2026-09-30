import type {
  WorldFaction,
  WorldForce,
  WorldForceRelation,
  WorldLocation,
  WorldLocationConnectionRelation,
  WorldLocationControlRelation,
  WorldProfile,
  WorldRule,
  WorldRules,
} from "@novelfoundry/shared/types/world";
import {
  normalizeText,
  normalizeStringArray,
  normalizeRecord,
  makeId,
} from "./fieldNormalization";

function buildRuleFromText(text: string, index: number): WorldRule {
  const normalized = text.trim();
  const [name, summary] = normalized.split(/[：:]/, 2);
  return {
    id: makeId("rule", index, name || normalized),
    name: (summary ? name : `规则 ${index + 1}`).trim(),
    summary: (summary ?? normalized).trim(),
    cost: "",
    boundary: "",
    enforcement: "",
  };
}

export function buildStructuredRulesFromAxiomTexts(axiomTexts: string[]): WorldRule[] {
  return axiomTexts
    .map((text, index) => buildRuleFromText(text, index))
    .filter((item, index, items) => items.findIndex((candidate) => candidate.name === item.name) === index);
}

export function normalizeProfile(raw: unknown, fallback: WorldProfile): WorldProfile {
  const record = normalizeRecord(raw);
  return {
    summary: normalizeText(record.summary ?? record.description, fallback.summary),
    identity: normalizeText(record.identity ?? record.worldIdentity, fallback.identity),
    tone: normalizeText(record.tone ?? record.mood, fallback.tone),
    themes: normalizeStringArray(record.themes ?? record.keywords).slice(0, 8),
    coreConflict: normalizeText(record.coreConflict ?? record.conflict, fallback.coreConflict),
  };
}

export function normalizeRules(raw: unknown, fallback: WorldRules): WorldRules {
  const record = normalizeRecord(raw);
  const axiomsSource = Array.isArray(record.axioms)
    ? record.axioms
    : Array.isArray(record.rules)
      ? record.rules
      : [];
  const axioms = axiomsSource
    .map((item, index) => {
      if (typeof item === "string") {
        return buildRuleFromText(item, index);
      }
      const row = normalizeRecord(item);
      const name = normalizeText(row.name ?? row.title ?? row.rule, "");
      const summary = normalizeText(row.summary ?? row.description ?? row.content, "");
      const id = normalizeText(row.id, "") || makeId("rule", index, name || summary || `rule-${index + 1}`);
      if (!name && !summary) {
        return null;
      }
      return {
        id,
        name: name || `规则 ${index + 1}`,
        summary: summary || name,
        cost: normalizeText(row.cost),
        boundary: normalizeText(row.boundary ?? row.limit),
        enforcement: normalizeText(row.enforcement ?? row.consequence),
      } satisfies WorldRule;
    })
    .filter((item): item is WorldRule => Boolean(item));

  return {
    summary: normalizeText(record.summary ?? record.description, fallback.summary),
    axioms,
    taboo: normalizeStringArray(record.taboo ?? record.taboos),
    sharedConsequences: normalizeStringArray(record.sharedConsequences ?? record.consequences),
  };
}

export function normalizeFaction(raw: unknown, index: number): WorldFaction | null {
  if (typeof raw === "string") {
    const value = raw.trim();
    if (!value) {
      return null;
    }
    return {
      id: makeId("faction", index, value),
      name: value,
      position: "",
      doctrine: "",
      goals: [],
      methods: [],
      representativeForceIds: [],
    };
  }
  const record = normalizeRecord(raw);
  const name = normalizeText(record.name ?? record.title ?? record.label);
  if (!name) {
    return null;
  }
  return {
    id: normalizeText(record.id) || makeId("faction", index, name),
    name,
    position: normalizeText(record.position ?? record.stance),
    doctrine: normalizeText(record.doctrine ?? record.summary ?? record.description),
    goals: normalizeStringArray(record.goals ?? record.objectives),
    methods: normalizeStringArray(record.methods),
    representativeForceIds: normalizeStringArray(record.representativeForceIds ?? record.forceIds),
  };
}

export function normalizeForce(raw: unknown, index: number): WorldForce | null {
  if (typeof raw === "string") {
    const value = raw.trim();
    if (!value) {
      return null;
    }
    return {
      id: makeId("force", index, value),
      name: value,
    type: "",
    factionId: null,
    role: null,
    resources: [],
    controlledLocationIds: [],
    summary: "",
      baseOfPower: "",
      currentObjective: "",
      pressure: "",
      leader: null,
      narrativeRole: "",
    };
  }
  const record = normalizeRecord(raw);
  const name = normalizeText(record.name ?? record.title ?? record.label);
  if (!name) {
    return null;
  }
  return {
    id: normalizeText(record.id) || makeId("force", index, name),
    name,
    type: normalizeText(record.type ?? record.category),
    factionId: normalizeText(record.factionId ?? record.faction) || null,
    role: normalizeText(record.role) || null,
    resources: normalizeStringArray(record.resources),
    controlledLocationIds: normalizeStringArray(record.controlledLocationIds ?? record.locationIds),
    summary: normalizeText(record.summary ?? record.description),
    baseOfPower: normalizeText(record.baseOfPower ?? record.powerBase),
    currentObjective: normalizeText(record.currentObjective ?? record.goal),
    pressure: normalizeText(record.pressure ?? record.tension),
    leader: normalizeText(record.leader) || null,
    narrativeRole: normalizeText(record.narrativeRole ?? record.role),
  };
}

export function normalizeLocation(raw: unknown, index: number): WorldLocation | null {
  if (typeof raw === "string") {
    const value = raw.trim();
    if (!value) {
      return null;
    }
    return {
      id: makeId("location", index, value),
      name: value,
      type: null,
      region: null,
      terrain: "",
      summary: "",
      narrativeFunction: "",
      risk: "",
      riskLevel: undefined,
      storyRelevance: "",
      entryConstraint: "",
      exitCost: "",
      controllingForceIds: [],
    };
  }
  const record = normalizeRecord(raw);
  const name = normalizeText(record.name ?? record.title ?? record.label);
  if (!name) {
    return null;
  }
  return {
    id: normalizeText(record.id) || makeId("location", index, name),
    name,
    type: normalizeText(record.type ?? record.category) || null,
    region: normalizeText(record.region) || null,
    x: normalizeMapCoordinate(record.x),
    y: normalizeMapCoordinate(record.y),
    directionHint: normalizeGeographyDirection(record.directionHint ?? record.direction),
    terrain: normalizeText(record.terrain ?? record.type ?? record.category),
    summary: normalizeText(record.summary ?? record.description),
    narrativeFunction: normalizeText(record.narrativeFunction ?? record.function),
    risk: normalizeText(record.risk ?? record.danger),
    riskLevel: normalizeRiskLevel(record.riskLevel),
    storyRelevance: normalizeText(record.storyRelevance) || normalizeText(record.narrativeFunction ?? record.function),
    entryConstraint: normalizeText(record.entryConstraint ?? record.access),
    exitCost: normalizeText(record.exitCost ?? record.leaveCost),
    controllingForceIds: normalizeStringArray(record.controllingForceIds ?? record.forceIds),
  };
}

function normalizeMapCoordinate(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return undefined;
  }
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function normalizeRiskLevel(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return undefined;
  }
  return Math.max(1, Math.min(5, Math.round(raw)));
}

function normalizeGeographyDirection(raw: unknown): WorldLocation["directionHint"] {
  if (typeof raw !== "string") {
    return undefined;
  }
  const normalized = raw.trim().toLowerCase();
  const aliases: Record<string, WorldLocation["directionHint"]> = {
    north: "north",
    "北": "north",
    "北方": "north",
    south: "south",
    "南": "south",
    "南方": "south",
    east: "east",
    "东": "east",
    "东方": "east",
    west: "west",
    "西": "west",
    "西方": "west",
    center: "center",
    "中": "center",
    "中央": "center",
    northeast: "northeast",
    "东北": "northeast",
    northwest: "northwest",
    "西北": "northwest",
    southeast: "southeast",
    "东南": "southeast",
    southwest: "southwest",
    "西南": "southwest",
  };
  return aliases[normalized];
}

export function normalizeForceRelation(raw: unknown, index: number): WorldForceRelation | null {
  const record = normalizeRecord(raw);
  const sourceForceId = normalizeText(record.sourceForceId ?? record.source ?? record.from);
  const targetForceId = normalizeText(record.targetForceId ?? record.target ?? record.to);
  if (!sourceForceId || !targetForceId || sourceForceId === targetForceId) {
    return null;
  }
  return {
    id: normalizeText(record.id) || makeId("force-relation", index, `${sourceForceId}-${targetForceId}`),
    sourceForceId,
    targetForceId,
    relation: normalizeText(record.relation ?? record.type, "关联"),
    tension: normalizeText(record.tension ?? record.pressure),
    detail: normalizeText(record.detail ?? record.summary ?? record.description),
  };
}

export function normalizeLocationControl(raw: unknown, index: number): WorldLocationControlRelation | null {
  const record = normalizeRecord(raw);
  const forceId = normalizeText(record.forceId ?? record.sourceForceId ?? record.force);
  const locationId = normalizeText(record.locationId ?? record.targetLocationId ?? record.location);
  if (!forceId || !locationId) {
    return null;
  }
  return {
    id: normalizeText(record.id) || makeId("location-control", index, `${forceId}-${locationId}`),
    forceId,
    locationId,
    relation: normalizeText(record.relation ?? record.type, "控制"),
    detail: normalizeText(record.detail ?? record.summary ?? record.description),
  };
}

export function normalizeLocationConnection(raw: unknown, index: number): WorldLocationConnectionRelation | null {
  const record = normalizeRecord(raw);
  const sourceLocationId = normalizeText(record.sourceLocationId ?? record.source ?? record.from);
  const targetLocationId = normalizeText(record.targetLocationId ?? record.target ?? record.to);
  if (!sourceLocationId || !targetLocationId || sourceLocationId === targetLocationId) {
    return null;
  }
  return {
    id: normalizeText(record.id) || makeId("location-connection", index, `${sourceLocationId}-${targetLocationId}`),
    sourceLocationId,
    targetLocationId,
    connectionType: normalizeText(record.connectionType ?? record.type ?? record.relation, "道路"),
    distanceHint: normalizeText(record.distanceHint ?? record.distance),
    narrativeUse: normalizeText(record.narrativeUse ?? record.detail ?? record.summary ?? record.description),
  };
}

export function seedFaction(name: string, description = ""): WorldFaction {
  return {
    id: makeId("faction", 0, name),
    name,
    position: "",
    doctrine: description,
    goals: [],
    methods: [],
    representativeForceIds: [],
  };
}

export function seedForce(name: string, description = "", category = ""): WorldForce {
  return {
    id: makeId("force", 0, name),
    name,
    type: category,
    factionId: null,
    role: null,
    resources: [],
    controlledLocationIds: [],
    summary: description,
    baseOfPower: "",
    currentObjective: "",
    pressure: "",
    leader: null,
    narrativeRole: "",
  };
}

export function seedLocation(name: string, description = "", terrain = ""): WorldLocation {
  return {
    id: makeId("location", 0, name),
    name,
    type: null,
    region: null,
    terrain,
    summary: description,
    narrativeFunction: "",
    risk: "",
    riskLevel: undefined,
    storyRelevance: "",
    entryConstraint: "",
    exitCost: "",
    controllingForceIds: [],
  };
}

export function formatRuleText(rule: WorldRule): string {
  const parts = [rule.summary, rule.cost && `代价：${rule.cost}`, rule.boundary && `边界：${rule.boundary}`, rule.enforcement && `约束：${rule.enforcement}`]
    .filter(Boolean);
  return `${rule.name}${parts.length > 0 ? `：${parts.join("；")}` : ""}`;
}
