import type { World as PrismaWorld } from "@prisma/client";

export type FactionNodeType = "state" | "faction" | "race" | "organization" | "other";

export type VisualizationSource = Pick<
  PrismaWorld,
  | "id"
  | "name"
  | "worldType"
  | "description"
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
  | "structureJson"
  | "bindingSupportJson"
>;

export interface VisualizationDraft {
  factionGraph?: {
    nodes?: Array<{ id?: string; label?: string; type?: string }>;
    edges?: Array<{ source?: string; target?: string; relation?: string }>;
  };
  powerTree?: Array<{ level?: string; description?: string }>;
  geographyMap?: {
    nodes?: Array<{
      id?: string;
      label?: string;
      x?: number;
      y?: number;
      directionHint?: string;
      regionType?: string;
      terrain?: string;
      summary?: string;
      parentId?: string | null;
      controllingForceIds?: string[];
      risk?: string;
      storyRelevance?: string;
    }>;
    edges?: Array<{
      source?: string;
      target?: string;
      relation?: string;
      routeType?: string;
      distanceHint?: string;
      direction?: string;
      risk?: string;
    }>;
  };
  timeline?: Array<{ year?: string; event?: string }>;
}

export type GeographyNodeInput = {
  id?: string;
  label?: string;
  x?: number;
  y?: number;
  directionHint?: unknown;
  regionType?: unknown;
  terrain?: unknown;
  summary?: unknown;
  parentId?: unknown;
  controllingForceIds?: unknown;
  risk?: unknown;
  storyRelevance?: unknown;
};

export type GeographyEdgeInput = {
  source?: unknown;
  target?: unknown;
  relation?: unknown;
  routeType?: unknown;
  distanceHint?: unknown;
  direction?: unknown;
  risk?: unknown;
};
