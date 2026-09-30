import { randomUUID } from "node:crypto";
import { repairReferenceMetadata } from "./referenceMetadata";
import { validateJsonEntityReferences, buildJsonReferenceIndex } from "./structuredReferences";
import { type BackupRow, type BackupTables, invalid } from "./archive";
import { references, sourceReferenceModel, imageReferences } from "./ownership";

export function portableRow(model: string, source: BackupRow, warnings: Set<string>): BackupRow {
  const row = { ...source };
  const clear = (...fields: string[]) => { for (const field of fields) if (field in row) row[field] = null; };
  if (model === "Novel") {
    if (row.sourceNovelId || row.derivedFromNovelId) warnings.add("母书和衍生关联未携带；本书已保存的来源内容仍保留。");
    clear("sourceNovelId", "derivedFromNovelId");
  }
  if (["BaseCharacter", "BaseCharacterRevision", "StyleProfile", "CreativeDecision", "CharacterSyncProposal"].includes(model) && !sourceReferenceModel(model, row)) {
    if (row.sourceRefId) warnings.add("资料来源的跨项目链接解除，资料正文和来源描述保留。");
    clear("sourceRefId");
  }
  if (model === "NovelWorkflowTask") {
    row.status = "succeeded"; row.progress = 1; row.pendingManualRecovery = false;
    row.lane = "manual_create";
    row.title = "导入作品的意图出处";
    row.currentStage = "imported_archive";
    clear("currentItemKey", "currentItemLabel", "checkpointType", "checkpointSummary", "resumeTargetJson", "seedPayloadJson", "milestonesJson", "heartbeatAt", "cancelRequestedAt", "lastError", "lastTokenRecordedAt");
    for (const key of ["attemptCount", "maxAttempts", "promptTokens", "completionTokens", "totalTokens", "llmCallCount"]) row[key] = 0;
  }
  if (model === "ImageGenerationTask") {
    row.status = "succeeded"; row.progress = 1; row.pendingManualRecovery = false;
    row.retryCount = 0; row.maxRetries = 0; row.currentStage = "imported_archive";
    clear("currentItemKey", "currentItemLabel", "heartbeatAt", "cancelRequestedAt", "error", "referenceImageAssetIdsJson");
  }
  if (model === "BookAnalysis") {
    if (row.status !== "succeeded") row.status = "archived"; row.pendingManualRecovery = false; row.usedTokens = 0;
    row.attemptCount = 0; row.maxAttempts = 0;
    clear("heartbeatAt", "cancelRequestedAt", "lastRunAt", "currentStage", "currentItemKey", "currentItemLabel");
  }
  if (model === "BookAnalysisSection" && row.status === "running") row.status = "idle";
  if (model === "KnowledgeDocument") { row.latestIndexStatus = "idle"; clear("lastIndexedAt"); }
  if (model === "Chapter" && row.chapterStatus === "generating") row.chapterStatus = row.content ? "pending_review" : "pending_generation";
  if (model === "NovelWorld") { row.syncEnabled = false; }
  if (model === "CharacterLibraryLink") row.syncPolicy = "manual_review";
  if (model === "AntiAiRule") row.globalBaselineEnabled = false;
  if (model === "ChapterPolishRevision") {
    row.status = "imported_readonly"; row.backupVerified = false; clear("generationJobId");
    const state = row.afterChapterStateJson ? JSON.parse(String(row.afterChapterStateJson)) : {};
    row.afterChapterStateJson = JSON.stringify({ ...state, version: 1, captureComplete: false, reason: "imported_readonly" });
  }
  return row;
}

// These are JSON containers, not prose fields. Prompt contextRefs contains slot names and is left intact.
const JSON_FIELDS = new Set(["structuredOutline", "sceneCards", "repairHistory", "riskFlags", "metadata", "snapshotData", "data", "slots", "selectedDimensions", "selectedElements", "layerStates", "consistencyReport"]);
const ENTITY_ID_KEYS = new Set([
  "id", "novelId", "chapterId", "chapterIds", "sourceChapterId", "characterId", "sourceCharacterId", "targetCharacterId",
  "ownerCharacterId", "holderCharacterId", "actorCharacterId", "fromHolderCharacterId", "toHolderCharacterId",
  "baseCharacterId", "baseRevisionId", "volumeId", "currentVolumeId", "currentChapterId", "snapshotId",
  "sourceSnapshotId", "sourceStateSnapshotId", "planId", "parentId", "sourcePlanId", "replannedFromPlanId",
  "setupChapterId", "payoffChapterId", "lastTouchedChapterId", "introducedChapterId", "sourceMindSnapshotId",
  "resolvedChapterId", "createdInChapterId", "resolvedInChapterId", "worldId", "novelWorldId", "sourceWorldId",
  "documentId", "documentVersionId", "analysisId", "sourceAnalysisId", "imageAssetId", "referenceAssetIds",
  "imageAssetIds", "referenceImageAssetIds", "referenceImageAssetIdsJson", "resourceId", "proposalId",
  "acceptedProposalIds", "acceptedProposalIdsJson", "sourceIssueIds", "sourceIssueIdsJson", "characterIds",
  "knownByCharacterIds", "knownByCharacterIdsJson", "affectedCharacterIds", "affectedCharacterIdsJson",
  "participantIds", "participantIdsJson", "relatedCharacterIds", "relatedCharacterIdsJson",
  "prerequisiteIds", "prerequisiteIdsJson", "consequenceIds", "consequenceIdsJson", "relatedEventIds",
  "relatedEventIdsJson", "relatedHookIds", "relatedHookIdsJson", "startsAfterIdsJson", "plannedEventIdsJson",
  "endedWithIdsJson", "previousHookIdsJson", "nextHookIdsJson", "forbiddenEventIdsJson", "refId", "targetId",
  "subjectId", "scopeId", "entityId", "holderRefId", "ownerId", "sessionId", "conversationSessionId",
]);
const HISTORICAL_JSON_FIELDS = new Set(["snapshotData", "snapshotJson", "rawStateJson", "beforeJson", "afterJson", "sourceSnapshotJson", "humanSnapshotJson"]);
const INTERNAL_IMAGE_URL = /\/api\/images\/assets\/([A-Za-z0-9_-]+)\/file/g;
export function referencedImageIds(tables: BackupTables): Set<string> {
  const ids = new Set<string>();
  for (const rows of Object.values(tables)) for (const row of rows) for (const id of imageReferences(row)) ids.add(id);
  return ids;
}
export interface RemappedBackup { tables: BackupTables; ids: Map<string, string>; novelId: string }
export function remapTables(tables: BackupTables, sourceNovelId: string, title: string): RemappedBackup {
  const ids = new Map<string, string>();
  const qualified = new Map<string, string>();
  for (const [model, rows] of Object.entries(tables)) for (const row of rows) {
    const id = randomUUID(); ids.set(row.id, id); qualified.set(`${model}:${row.id}`, id);
  }
  // Embedded deleted-history/world entity IDs have no live row; give them a consistent private namespace.
  const historicalIds = new Map<string, string>();
  const mapId = (value: string): string => {
    if (!value) return value;
    const found = ids.get(value) ?? historicalIds.get(value);
    if (found) return found;
    const next = randomUUID(); historicalIds.set(value, next); return next;
  };
  const resourceKeys = new Map<string, string>();
  for (const row of tables.CharacterResourceLedgerItem ?? []) {
    if (typeof row.resourceKey !== "string") continue;
    let next = row.resourceKey;
    for (const character of tables.Character ?? []) {
      const suffix = character.id.slice(0, 32);
      if (next.endsWith(suffix)) next = next.slice(0, -suffix.length) + ids.get(character.id)!.slice(0, 32);
    }
    resourceKeys.set(row.resourceKey, next);
  }
  const ruleKeys = new Map((tables.AntiAiRule ?? []).map((row) => [String(row.key), `import_${ids.get(row.id)}`]));
  const visit = (value: unknown, key = "", depth = 0, history = false): unknown => {
    if (depth > 64) invalid("结构化资料嵌套过深。");
    if (typeof value === "string") {
      if (key !== "contextRefsJson" && (key.endsWith("Json") || JSON_FIELDS.has(key)) && /^[\s]*[\[{]/.test(value)) {
        try { return JSON.stringify(visit(JSON.parse(value), key, depth + 1, history)); }
        catch { invalid("历史快照包含无法读取的嵌套结构。"); }
      }
      if (key === "resourceKey") return resourceKeys.get(value) ?? value;
      if (["antiAiRuleKey", "antiAiRuleKeys", "extractionAntiAiRuleKeysJson", "defaultAntiAiRuleKeysJson"].includes(key)) return ruleKeys.get(value) ?? value;
      if (ENTITY_ID_KEYS.has(key)) {
        if (ids.has(value)) return ids.get(value)!;
        if (history && key !== "id") return mapId(value);
        // Local scene/force/location keys are scoped inside the cloned document and are stable.
        return value;
      }
      return value.replace(INTERNAL_IMAGE_URL, (full, id: string) => ids.has(id) ? `/api/images/assets/${ids.get(id)}/file` : full);
    }
    if (Array.isArray(value)) return value.map((entry) => visit(entry, key, depth + 1, history));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([child, entry]) => [child, visit(entry, child, depth + 1, history)]));
    return value;
  };
  const output: BackupTables = {};
  for (const [model, rows] of Object.entries(tables)) output[model] = rows.map((source) => {
    const row = portableRow(model, source, new Set());
    row.id = ids.get(source.id)!;
    for (const [field, target] of Object.entries(references(model, source))) {
      const value = source[field];
      if (typeof value === "string" && value) {
        const next = qualified.get(`${target}:${value}`);
        if (!next) invalid(`${model}.${field}无法映射。`);
        row[field] = next;
      }
    }
    for (const [field, value] of Object.entries(row)) {
      if (typeof value !== "string" || field === "id" || references(model, source)[field]) continue;
      if ((field.endsWith("Json") || JSON_FIELDS.has(field)) && value.trim() && field !== "contextRefsJson") {
        try { row[field] = JSON.stringify(visit(JSON.parse(value), field, 0, HISTORICAL_JSON_FIELDS.has(field))); }
        catch { invalid(`${model}.${field}结构化资料格式错误。`); }
      } else if (field === "resourceKey") row[field] = resourceKeys.get(value) ?? value;
      else if (field !== "contextRefsJson") row[field] = value.replace(INTERNAL_IMAGE_URL, (full, id: string) => ids.has(id) ? `/api/images/assets/${ids.get(id)}/file` : full);
    }
    if (typeof source.proposalSetId === "string") row.proposalSetId = mapId(source.proposalSetId);
    if (model === "AntiAiRule") row.key = ruleKeys.get(String(source.key))!;
    if (model === "ChapterPolishRevision") row.operationKey = `import:${row.id}`;
    if (model === "ChapterPolishMutation") {
      row.entityId = mapId(String(source.entityId));
    }
    if (model === "Novel") row.title = title;
    return row;
  });
  repairReferenceMetadata(tables, output, ids);
  return { tables: output, ids, novelId: ids.get(sourceNovelId)! };
}
export function validateStructuredFields(tables: BackupTables): void {
  const referenceIndex = buildJsonReferenceIndex(tables);
  for (const [model, rows] of Object.entries(tables)) for (const row of rows) {
    for (const [field, value] of Object.entries(row)) {
      if (typeof value !== "string" || !value.trim()) continue;
      if (field.endsWith("Json") || JSON_FIELDS.has(field)) {
        let parsed: unknown;
        try { parsed = JSON.parse(value); } catch { invalid(`${model}.${field}含有无法读取的结构化资料。`); }
        // Traversal protects against deeply nested JSON strings before import opens a transaction.
        const check = (item: unknown, depth: number): void => {
          if (depth > 64) invalid("结构化资料嵌套过深。");
          if (item && typeof item === "object") {
            for (const [key, child] of Object.entries(item)) {
              if (["__proto__", "prototype", "constructor"].includes(key)) invalid("结构化资料含非法字段。");
              check(child, depth + 1);
            }
          }
        };
        check(parsed, 0);
        validateJsonEntityReferences(referenceIndex, model, field, parsed);
      }
    }
    if (model === "WorldAsset" && typeof row.thumbnailUrl === "string" && row.thumbnailUrl && !row.thumbnailUrl.startsWith("/api/images/assets/")) {
      invalid("世界资料缩略图尚未保存为受管图片，请先保存图片后再备份。");
    }
  }
}
