import { createHash } from "node:crypto";
import { polishRelations } from "./PolishRelations";
import { Prisma } from "@prisma/client";

export const polishEntities = [
  "chapter", "character", "storyPlan", "chapterPlanScene", "chapterSummary", "consistencyFact", "novelFactEntry", "storyStateSnapshot",
  "characterState", "relationState", "informationState", "foreshadowState", "openConflict", "payoffLedgerItem",
  "characterResourceLedgerItem", "characterResourceEvent", "canonicalStateVersion", "stateChangeProposal",
  "characterTimeline", "characterCandidate", "characterFactionTrack", "characterRelationStage", "characterMindSnapshot",
  "characterInfluenceProposal", "characterDialogueInfluence", "storyTimelineEvent", "chapterTimeAnchor", "timelineHook",
  "timelineConstraint", "timelineCheckReport", "qualityReport", "auditReport", "auditIssue", "chapterArtifactSyncCheckpoint",
] as const;
export type PolishEntity = typeof polishEntities[number];
export type StoredRow = Record<string, unknown> & { id: string };
export type JournalImage = Map<string, Map<string, StoredRow>>;
export interface JournalChange { entityType: string; entityId: string; beforeJson: string | null; afterJson: string | null; }

export const rawContentHash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
}
export function rowJson(row: StoredRow): string { return stableJson(row); }
export function modelFor(entity: string) {
  return Prisma.dmmf.datamodel.models.find((model) => model.name[0].toLowerCase() + model.name.slice(1) === entity);
}
export function novelScope(entity: string, novelId: string): Record<string, unknown> {
  if (["characterState", "relationState", "informationState", "foreshadowState"].includes(entity)) return { snapshot: { novelId } };
  if (entity === "auditIssue") return { report: { novelId } };
  if (entity === "chapterPlanScene") return { plan: { novelId } };
  return { novelId };
}
export function decodeRow(entity: string, serialized: string): StoredRow {
  const row = JSON.parse(serialized) as StoredRow;
  for (const field of modelFor(entity)?.fields ?? []) {
    if (field.type === "DateTime" && row[field.name] != null) row[field.name] = new Date(String(row[field.name]));
  }
  return row;
}

/** Dependency order is used only for persistence, never for product intent. */
export function orderChanges(changes: JournalChange[]): JournalChange[] {
  const rank = (entity: string, seen = new Set<string>()): number => {
    if (seen.has(entity)) return 0;
    seen.add(entity);
    const parents = polishRelations().filter((relation) => relation.owner === entity)
      .map((relation) => relation.target).filter((name) => polishEntities.includes(name as PolishEntity));
    if (entity === "stateChangeProposal") parents.push("storyStateSnapshot");
    return parents.length ? 1 + Math.max(...parents.map((parent) => rank(parent, new Set(seen)))) : 0;
  };
  const group = (change: JournalChange) => change.beforeJson === null ? 0 : change.afterJson === null ? 2 : 1;
  return [...changes].sort((a, b) => group(a) - group(b) || (group(a) === 2 ? -1 : 1) * (rank(a.entityType) - rank(b.entityType)) || a.entityId.localeCompare(b.entityId));
}
export function diffImages(before: JournalImage, after: JournalImage): JournalChange[] {
  const changes: JournalChange[] = [];
  for (const entity of polishEntities) {
    const oldRows = before.get(entity) ?? new Map(); const newRows = after.get(entity) ?? new Map();
    for (const id of new Set([...oldRows.keys(), ...newRows.keys()])) {
      const oldValue = oldRows.has(id) ? rowJson(oldRows.get(id)!) : null;
      const newValue = newRows.has(id) ? rowJson(newRows.get(id)!) : null;
      if (oldValue !== newValue) changes.push({ entityType: entity, entityId: id, beforeJson: oldValue, afterJson: newValue });
    }
  }
  return orderChanges(changes);
}
