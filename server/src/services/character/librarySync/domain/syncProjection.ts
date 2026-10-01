import { baseCharacterDraftSchema, characterLibraryLinkSchema, characterSyncProposalSchema, type BaseCharacterDraft, type CharacterLibraryLink, type CharacterSyncFieldUpdate, type CharacterSyncProposal } from "@novelfoundry/shared/types/characterSync";

import { type BaseCharacterRow, APPLY_TO_NOVEL_FIELDS } from "./records";

export function compactText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value?.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function parseJsonArray<T>(value: string | null | undefined): T[] {
  if (!value?.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function sanitizeBaseCharacterDraft(input: unknown): BaseCharacterDraft {
  const parsed = baseCharacterDraftSchema.parse(input);
  return {
    name: parsed.name,
    role: parsed.role,
    personality: parsed.personality,
    background: parsed.background,
    development: parsed.development,
    appearance: compactText(parsed.appearance) || null,
    weaknesses: compactText(parsed.weaknesses) || null,
    interests: compactText(parsed.interests) || null,
    keyEvents: compactText(parsed.keyEvents) || null,
    tags: compactText(parsed.tags),
    category: parsed.category,
  };
}

export function baseCharacterToDraft(row: BaseCharacterRow): BaseCharacterDraft {
  return sanitizeBaseCharacterDraft({
    name: row.name,
    role: row.role,
    personality: row.personality,
    background: row.background,
    development: row.development,
    appearance: row.appearance,
    weaknesses: row.weaknesses,
    interests: row.interests,
    keyEvents: row.keyEvents,
    tags: row.tags ?? "",
    category: row.category,
  });
}

export function mapLink(row: {
  id: string;
  novelId: string;
  characterId: string;
  baseCharacterId: string;
  baseRevisionId: string | null;
  syncPolicy: string;
  linkStatus: string;
  localOverridesJson: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): CharacterLibraryLink {
  return characterLibraryLinkSchema.parse({
    id: row.id,
    novelId: row.novelId,
    characterId: row.characterId,
    baseCharacterId: row.baseCharacterId,
    baseRevisionId: row.baseRevisionId,
    syncPolicy: row.syncPolicy,
    linkStatus: row.linkStatus,
    localOverrides: parseJsonObject(row.localOverridesJson),
    lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function mapProposal(row: {
  id: string;
  novelId: string | null;
  characterId: string | null;
  baseCharacterId: string | null;
  baseRevisionId: string | null;
  direction: string;
  status: string;
  confidence: number | null;
  summary: string;
  payloadJson: string;
  safeUpdatesJson: string | null;
  novelOnlyUpdatesJson: string | null;
  riskyUpdatesJson: string | null;
  recommendedAction: string | null;
  sourceType: string;
  sourceRefId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CharacterSyncProposal {
  return characterSyncProposalSchema.parse({
    id: row.id,
    novelId: row.novelId,
    characterId: row.characterId,
    baseCharacterId: row.baseCharacterId,
    baseRevisionId: row.baseRevisionId,
    direction: row.direction,
    status: row.status,
    confidence: row.confidence,
    summary: row.summary,
    payload: parseJsonObject(row.payloadJson),
    safeUpdates: parseJsonArray<CharacterSyncFieldUpdate>(row.safeUpdatesJson),
    novelOnlyUpdates: parseJsonArray<CharacterSyncFieldUpdate>(row.novelOnlyUpdatesJson),
    riskyUpdates: parseJsonArray<CharacterSyncFieldUpdate>(row.riskyUpdatesJson),
    recommendedAction: row.recommendedAction,
    sourceType: row.sourceType,
    sourceRefId: row.sourceRefId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export function buildLibraryUpdateFields(baseSnapshot: BaseCharacterDraft): CharacterSyncFieldUpdate[] {
  return APPLY_TO_NOVEL_FIELDS.map((field) => ({
    field,
    layer: field === "name" || field === "role" ? "identity" : "persona",
    summary: `角色库字段 ${field} 有新版本`,
    reason: "这是角色库里的稳定基础设定，应用到本小说前需要用户确认。",
    toValue: String(baseSnapshot[field] ?? ""),
  }));
}
