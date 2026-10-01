import type { WorldVisualizationPayload } from "@novelfoundry/shared/types/world";

import { type VisualizationSource } from "../domain/contracts";

import { uniqueStrings, makeId } from "../domain/textNormalization";

import { MAX_FACTION_NODES, normalizeEdgeRelation, MAX_FACTION_EDGES, inferFactionNodeType } from "../domain/factionGraph";

import { MAX_GEO_NODES, inferDirectionFromText, offsetCoordinate, DIRECTION_COORDINATES, inferRegionType } from "../domain/geographyMap";

export const MAX_TIMELINE_ITEMS = 12;

export const MAX_POWER_ITEMS = 8;

export function cleanJsonText(source: string): string {
  return source.replace(/```json|```/gi, "").trim();
}

export function extractJSONObject(source: string): string {
  const text = cleanJsonText(source);
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || first >= last) {
    throw new Error("Invalid JSON object.");
  }
  return text.slice(first, last + 1);
}

export function safeParseJSON<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function splitIntoLines(source: string): string[] {
  return source
    .split(/[\n;；]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function splitIntoSentences(source: string): string[] {
  return source
    .split(/[\n。！？!?；;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseListFromText(content: string, fallback: string[]): string[] {
  const parsed = content
    .split(/[\n,，;；]/)
    .map((item) => item.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallback;
}

export function extractNamedEntities(
  source: string,
  matcher: RegExp,
  exclusions: Set<string>,
): string[] {
  const results: string[] = [];
  for (const match of source.matchAll(matcher)) {
    const value = match[0]?.trim();
    if (!value || exclusions.has(value)) {
      continue;
    }
    results.push(value);
  }
  return results;
}

export function buildFactionLabels(world: VisualizationSource): string[] {
  const combined = [
    world.factions ?? "",
    world.politics ?? "",
    world.races ?? "",
    world.conflicts ?? "",
  ].filter(Boolean).join("\n");
  const exclusions = new Set([
    "核心冲突",
    "主要势力",
    "势力关系",
    "政治结构",
    "组织势力",
    "阵营关系",
    "社会结构",
  ]);
  const fromLists = parseListFromText(combined, []);
  const namedEntities = extractNamedEntities(
    combined,
    /[\u4E00-\u9FFF]{2,16}(?:政府|政权|王朝|王国|帝国|联邦|共和国|军|军队|部队|军团|旅|团|会|盟|帮|派|组织|教团|族|族群|民族)/g,
    exclusions,
  );
  return uniqueStrings([...fromLists, ...namedEntities]).slice(0, MAX_FACTION_NODES);
}

export function buildFactionEdges(
  nodes: Array<{ id: string; label: string; type: string }>,
  world: VisualizationSource,
): Array<{ source: string; target: string; relation: string }> {
  const sentences = splitIntoSentences([
    world.politics ?? "",
    world.factions ?? "",
    world.conflicts ?? "",
    world.background ?? "",
  ].filter(Boolean).join("。"));
  const relationCounter = new Map<string, Map<string, number>>();

  for (const sentence of sentences) {
    const mentioned = nodes.filter((node) => sentence.includes(node.label));
    if (mentioned.length < 2) {
      continue;
    }
    const relation = normalizeEdgeRelation("", sentence);
    for (let i = 0; i < mentioned.length; i += 1) {
      for (let j = i + 1; j < mentioned.length; j += 1) {
        const left = mentioned[i];
        const right = mentioned[j];
        const key = [left.id, right.id].sort().join("|");
        const bucket = relationCounter.get(key) ?? new Map<string, number>();
        bucket.set(relation, (bucket.get(relation) ?? 0) + 1);
        relationCounter.set(key, bucket);
      }
    }
  }

  const edges = Array.from(relationCounter.entries())
    .map(([key, bucket]) => {
      const [source, target] = key.split("|");
      const relation = Array.from(bucket.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "关联";
      return { source, target, relation };
    })
    .slice(0, MAX_FACTION_EDGES);

  if (edges.length > 0) {
    return edges;
  }
  if (nodes.length <= 1) {
    return [];
  }
  const defaultRelation = world.conflicts?.trim() ? "对抗" : "关联";
  return nodes.slice(1).map((node) => ({
    source: nodes[0].id,
    target: node.id,
    relation: defaultRelation,
  }));
}

export function buildGeographyMap(world: VisualizationSource): WorldVisualizationPayload["geographyMap"] {
  const geoSeeds = parseListFromText(
    [world.geography ?? "", world.background ?? ""].filter(Boolean).join("\n"),
    ["核心区域", "边境区域", "未知区域"],
  )
    .slice(0, MAX_GEO_NODES)
    .map((label, index) => {
      const directionHint = inferDirectionFromText(label, index);
      const point = offsetCoordinate(DIRECTION_COORDINATES[directionHint], index);
      return {
        id: makeId("geo", index),
        label,
        x: point.x,
        y: point.y,
        directionHint,
        regionType: inferRegionType(label),
      };
    });

  const edges = geoSeeds.slice(1).map((node, index) => ({
    source: geoSeeds[index]?.id ?? geoSeeds[0].id,
    target: node.id,
    relation: "相邻",
    routeType: "other" as const,
    direction: node.directionHint,
  }));

  return {
    nodes: geoSeeds,
    edges,
  };
}

export function buildPowerTree(world: VisualizationSource): WorldVisualizationPayload["powerTree"] {
  return parseListFromText(world.magicSystem ?? world.technology ?? "", ["力量层级未明确"])
    .slice(0, MAX_POWER_ITEMS)
    .map((description, index) => ({
      level: `L${index + 1}`,
      description,
    }));
}

export function buildTimeline(world: VisualizationSource): WorldVisualizationPayload["timeline"] {
  return parseListFromText(world.history ?? "", ["当前历史脉络尚未明确"])
    .slice(0, MAX_TIMELINE_ITEMS)
    .map((event, index) => {
      const yearMatch = event.match(/\d{2,4}(?:年)?|民国\d+年|昭和\d+年|stage\s*\d+/i);
      return {
        year: yearMatch?.[0] ?? `阶段${index + 1}`,
        event,
      };
    });
}

export function buildFallbackWorldVisualizationPayload(world: VisualizationSource): WorldVisualizationPayload {
  const factionLabels = buildFactionLabels(world);
  const factionNodes = factionLabels.map((label, index) => ({
    id: makeId("faction", index),
    label,
    type: inferFactionNodeType(label),
  }));
  const factionEdges = buildFactionEdges(factionNodes, world);

  return {
    worldId: world.id,
    factionGraph: {
      nodes: factionNodes,
      edges: factionEdges,
    },
    powerTree: buildPowerTree(world),
    geographyMap: buildGeographyMap(world),
    timeline: buildTimeline(world),
  };
}
