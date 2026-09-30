import type { World as PrismaWorld } from "@prisma/client";
import type {
  WorldFaction,
  WorldForce,
  WorldForceRelation,
  WorldLocation,
  WorldStructuredData,
} from "@novelfoundry/shared/types/world";
import { WORLD_STRUCTURE_SCHEMA_VERSION, createEmptyWorldRelations, createEmptyWorldStructure } from "../domain/emptyStructure";
import {
  buildStructuredRulesFromAxiomTexts,
  normalizeFaction,
  normalizeForce,
  normalizeLocation,
  seedFaction,
  seedForce,
  seedLocation,
} from "../domain/entities";
import {
  normalizeText,
  normalizeStringArray,
  normalizeRecord,
  makeId,
  parseListText,
  dedupeById,
  dedupeByName,
} from "../domain/fieldNormalization";
import { normalizeWorldStructuredData } from "../domain/normalizeStructure";
import { safeParseJSON } from "./payloadCodec";

export type WorldStructureSource = Pick<
  PrismaWorld,
  | "id"
  | "name"
  | "worldType"
  | "description"
  | "overviewSummary"
  | "axioms"
  | "background"
  | "geography"
  | "cultures"
  | "magicSystem"
  | "politics"
  | "races"
  | "religions"
  | "technology"
  | "conflicts"
  | "history"
  | "economy"
  | "factions"
  | "selectedElements"
  | "structureJson"
  | "bindingSupportJson"
  | "structureSchemaVersion"
>;

function parseLegacyJSON(raw: string | null | undefined): unknown {
  return safeParseJSON<unknown>(raw, null);
}

function parseLegacyArray(raw: string | null | undefined, preferredKeys: string[] = []): unknown[] | null {
  const parsed = parseLegacyJSON(raw);
  if (Array.isArray(parsed)) {
    return parsed;
  }
  const record = normalizeRecord(parsed);
  for (const key of preferredKeys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return null;
}

function parseLegacyObject(raw: string | null | undefined): Record<string, unknown> {
  return normalizeRecord(parseLegacyJSON(raw));
}

function parseAxiomStrings(raw: string | null | undefined): string[] {
  const parsed = safeParseJSON<unknown>(raw, null);
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => normalizeText(item))
      .filter(Boolean);
  }
  return parseListText(raw);
}

function buildLegacyFactionSeeds(raw: string | null | undefined): { factions: WorldFaction[]; forces: WorldForce[] } {
  const parsedItems = parseLegacyArray(raw, ["factions", "forces", "organizations"]);
  if (parsedItems) {
    const factions = parsedItems
      .map((item, index) => normalizeFaction(item, index))
      .filter((item): item is WorldFaction => Boolean(item));
    const forces = parsedItems
      .map((item, index) => normalizeForce(item, index))
      .filter((item): item is WorldForce => Boolean(item));
    return { factions, forces };
  }
  const names = parseListText(raw);
  return {
    factions: names.map((name) => seedFaction(name)),
    forces: names.map((name) => seedForce(name)),
  };
}

function inferLegacyLocationName(text: string): string {
  const normalized = text.replace(/^[-*]\s*/, "").trim();
  const afterColon = normalized.includes("：") ? normalized.split("：").slice(1).join("：").trim() : normalized;
  const patterns: Array<[RegExp, string]> = [
    [/太平洋.*禁航区|太平洋.*异界入口|深海.*异界入口/, "太平洋深海禁航区"],
    [/北极冰盖|北极.*基地/, "北极冰盖秘密基地"],
    [/昆仑山|昆仑.*通道/, "昆仑山神话通道"],
    [/阿尔卑斯.*古堡|欧洲.*古堡/, "阿尔卑斯古堡指挥中心"],
    [/城市.*地下|地下.*设施/, "全球城市地下设施"],
    [/南极冰盖|极夜风暴/, "南极旧日封印区"],
  ];
  for (const [pattern, name] of patterns) {
    if (pattern.test(afterColon)) {
      return name;
    }
  }
  const candidate = afterColon
    .split(/[，。,.]|被|隐藏|实为|用于|传言|内有|是/)
    .map((item) => item.trim())
    .find((item) => item.length >= 2);
  return candidate ? candidate.slice(0, 24) : normalized.slice(0, 24);
}

function splitLegacyGeographyClauses(raw: string | null | undefined): string[] {
  const normalized = raw?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }
  const content = normalized.includes("：")
    ? normalized.split("：").slice(1).join("：").trim()
    : normalized;
  return Array.from(
    new Set(
      content
        .split(/[\n;；]+/)
        .map((item) => item.replace(/^此外[，,]\s*/, "").trim())
        .filter((item) => item.length >= 4),
    ),
  );
}

function buildLegacyLocationSeeds(geography: string | null | undefined, conflicts: string | null | undefined): WorldLocation[] {
  const parsedLocations = parseLegacyArray(geography, ["locations", "regions", "places"]);
  const locations = parsedLocations
    ? parsedLocations
      .map((item, index) => normalizeLocation(item, index))
      .filter((item): item is WorldLocation => Boolean(item))
    : splitLegacyGeographyClauses(geography)
      .map((item, index) => seedLocation(inferLegacyLocationName(item), item))
      .filter((item) => item.name);

  const conflictObject = parseLegacyObject(conflicts);
  const flashpoints = Array.isArray(conflictObject.flashpoints) ? conflictObject.flashpoints : [];
  const flashpointLocations = flashpoints
    .map((item, index) => {
      const record = normalizeRecord(item);
      const name = normalizeText(record.location ?? record.name);
      if (!name) {
        return null;
      }
      return seedLocation(name, normalizeText(record.description), "冲突热点");
    })
    .filter((item): item is WorldLocation => Boolean(item));

  return dedupeByName([...locations, ...flashpointLocations]);
}

function buildLegacyForceRelations(conflicts: string | null | undefined, forces: WorldForce[]): WorldForceRelation[] {
  const conflictObject = parseLegacyObject(conflicts);
  const primaryConflicts = Array.isArray(conflictObject.primaryConflicts) ? conflictObject.primaryConflicts : [];
  const forceByName = new Map(forces.map((item) => [item.name, item]));
  const relations: WorldForceRelation[] = [];
  primaryConflicts.forEach((item, index) => {
    const record = normalizeRecord(item);
    const parties = normalizeStringArray(record.parties);
    const matched = parties
      .map((party) => Array.from(forceByName.values()).find((force) => party.includes(force.name) || force.name.includes(party)))
      .filter((force): force is WorldForce => Boolean(force));
    if (matched.length < 2) {
      return;
    }
    relations.push({
      id: makeId("force-relation", index, `${matched[0].id}-${matched[1].id}`),
      sourceForceId: matched[0].id,
      targetForceId: matched[1].id,
      relation: normalizeText(record.type, "冲突"),
      tension: normalizeText(record.type),
      detail: normalizeText(record.description),
    });
  });
  return dedupeById(relations);
}

export function buildWorldStructureFromLegacySource(source: WorldStructureSource): WorldStructuredData {
  const empty = createEmptyWorldStructure();
  const factionSeeds = buildLegacyFactionSeeds(source.factions);
  const policyObject = parseLegacyObject(source.politics);
  const policyForceName = normalizeText(policyObject.governance) ? "三方联合委员会" : "";
  const extraForces = policyForceName ? [seedForce(policyForceName, normalizeText(policyObject.governance), "coordination")] : [];
  const forces = dedupeByName([...factionSeeds.forces, ...extraForces]);
  const locations = buildLegacyLocationSeeds(source.geography, source.conflicts);
  const axiomTexts = parseAxiomStrings(source.axioms);

  const structure = normalizeWorldStructuredData(
    {
      profile: {
        summary: source.description ?? source.overviewSummary ?? "",
        identity: source.worldType ? `${source.worldType} 世界` : "",
        tone: "",
        themes: parseListText(source.cultures).slice(0, 6),
        coreConflict: source.conflicts ?? "",
      },
      rules: {
        summary: source.magicSystem ?? "",
        axioms: buildStructuredRulesFromAxiomTexts(axiomTexts),
        taboo: [],
        sharedConsequences: [],
      },
      factions: dedupeByName(factionSeeds.factions),
      forces,
      locations,
      relations: {
        ...createEmptyWorldRelations(),
        forceRelations: buildLegacyForceRelations(source.conflicts, forces),
      },
      metadata: {
        schemaVersion: WORLD_STRUCTURE_SCHEMA_VERSION,
        seededFrom: "legacy-text",
      },
    },
    empty,
  );

  return structure;
}
