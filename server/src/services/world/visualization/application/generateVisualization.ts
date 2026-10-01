import type { WorldVisualizationPayload } from "@novelfoundry/shared/types/world";

import { runStructuredPrompt } from "../../../../prompting/core/promptRunner";

import { worldVisualizationPrompt } from "../../../../prompting/prompts/world/world.prompts";

import { type VisualizationSource, type VisualizationDraft } from "../domain/contracts";

import { normalizeGraphNodes, MAX_FACTION_NODES, normalizeGraphEdges } from "../domain/factionGraph";

import { normalizeGeographyNodes, normalizeGeographyEdges } from "../domain/geographyMap";

import { MAX_POWER_ITEMS, MAX_TIMELINE_ITEMS, buildFallbackWorldVisualizationPayload } from "../infrastructure/legacySourceProjection";

import { buildStructuredWorldVisualizationPayload } from "../projections/structuredWorldProjection";

export function buildVisualizationPrompt(world: VisualizationSource): string {
  return [
    `世界名：${world.name}`,
    `世界类型：${world.worldType ?? "custom"}`,
    `概述：${world.description ?? "无"}`,
    `背景：${world.background ?? "无"}`,
    `势力：${world.factions ?? "无"}`,
    `政治：${world.politics ?? "无"}`,
    `种族：${world.races ?? "无"}`,
    `地理：${world.geography ?? "无"}`,
    `历史：${world.history ?? "无"}`,
    `冲突：${world.conflicts ?? "无"}`,
    `力量/科技：${[world.magicSystem, world.technology].filter(Boolean).join("\n") || "无"}`,
  ].join("\n\n");
}

export async function tryBuildWorldVisualizationWithLLM(
  world: VisualizationSource,
): Promise<VisualizationDraft | null> {
  try {
    const result = await runStructuredPrompt({
      asset: worldVisualizationPrompt,
      promptInput: {
        worldPromptSource: buildVisualizationPrompt(world),
      },
      options: {
        temperature: 0.2,
      },
    });
    return result.output;
  } catch {
    return null;
  }
}

export function sanitizeVisualizationPayload(
  world: VisualizationSource,
  draft: VisualizationDraft | null,
  fallback: WorldVisualizationPayload,
): WorldVisualizationPayload {
  const factionNodes = normalizeGraphNodes(draft?.factionGraph?.nodes ?? fallback.factionGraph.nodes, "faction")
    .slice(0, MAX_FACTION_NODES);
  const factionEdges = normalizeGraphEdges(
    draft?.factionGraph?.edges ?? [],
    factionNodes,
    fallback.factionGraph.edges,
  );

  const geographyNodes = normalizeGeographyNodes(
    draft?.geographyMap?.nodes ?? fallback.geographyMap.nodes,
    fallback.geographyMap.nodes,
  );
  const geographyEdges = normalizeGeographyEdges(
    draft?.geographyMap?.edges ?? [],
    geographyNodes,
    fallback.geographyMap.edges,
  );

  const powerTree = (draft?.powerTree ?? fallback.powerTree)
    .map((item, index) => ({
      level: typeof item.level === "string" && item.level.trim() ? item.level.trim() : `L${index + 1}`,
      description: typeof item.description === "string" ? item.description.trim() : "",
    }))
    .filter((item) => item.description)
    .slice(0, MAX_POWER_ITEMS);

  const timeline = (draft?.timeline ?? fallback.timeline)
    .map((item, index) => ({
      year: typeof item.year === "string" && item.year.trim() ? item.year.trim() : `阶段${index + 1}`,
      event: typeof item.event === "string" ? item.event.trim() : "",
    }))
    .filter((item) => item.event)
    .slice(0, MAX_TIMELINE_ITEMS);

  return {
    worldId: world.id,
    factionGraph: {
      nodes: factionNodes.length > 0 ? factionNodes : fallback.factionGraph.nodes,
      edges: factionEdges,
    },
    powerTree: powerTree.length > 0 ? powerTree : fallback.powerTree,
    geographyMap: {
      nodes: geographyNodes.length > 0 ? geographyNodes : fallback.geographyMap.nodes,
      edges: geographyEdges,
    },
    timeline: timeline.length > 0 ? timeline : fallback.timeline,
  };
}

export async function buildWorldVisualizationPayload(world: VisualizationSource): Promise<WorldVisualizationPayload> {
  const structured = buildStructuredWorldVisualizationPayload(world);
  if (structured) {
    return structured;
  }
  const fallback = buildFallbackWorldVisualizationPayload(world);
  const draft = await tryBuildWorldVisualizationWithLLM(world);
  return sanitizeVisualizationPayload(world, draft, fallback);
}
