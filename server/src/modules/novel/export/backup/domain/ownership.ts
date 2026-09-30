import { BACKUP_MODELS } from "./catalog";
import { type BackupRow, type BackupTables, invalid } from "./archive";

export const SHELL_MODELS = new Set(["NovelWorkflowTask", "ImageGenerationTask"]);
// Only these ownership edges expand in reverse. Foreign keys expand forward to selected dependencies.
// Expanding every inverse relation would silently copy unrelated books/documents.
export const CHILD_EDGES: Array<[string, string, string]> = [
  ["PromptTemplateVersion", "overrideId", "PromptTemplateOverride"],
  ["ShortStorySegment", "planId", "ShortStoryPlan"],
  ["CharacterDialogueTurn", "sessionId", "CharacterDialogueSession"],
  ["CharacterConversationTurn", "sessionId", "CharacterConversationSession"],
  ["CharacterCastOptionMember", "optionId", "CharacterCastOption"],
  ["CharacterCastOptionRelation", "optionId", "CharacterCastOption"],
  ["BaseCharacterRevision", "baseCharacterId", "BaseCharacter"],
  ["ImageAsset", "baseCharacterId", "BaseCharacter"],
  ["ImageAsset", "bookAnalysisCharacterId", "BookAnalysisCharacter"],
  ["WorldAsset", "worldId", "World"], ["WorldAsset", "novelWorldId", "NovelWorld"],
  ["WorldSyncRecord", "novelWorldId", "NovelWorld"],
  ["WorldSnapshot", "worldId", "World"], ["WorldDeepeningQA", "worldId", "World"],
  ["WorldConsistencyIssue", "worldId", "World"],
  ["StyleProfileAntiAiRule", "styleProfileId", "StyleProfile"],
  ["VolumeChapterPlan", "volumeId", "VolumePlan"],
  ["CharacterState", "snapshotId", "StoryStateSnapshot"],
  ["RelationState", "snapshotId", "StoryStateSnapshot"],
  ["InformationState", "snapshotId", "StoryStateSnapshot"],
  ["ForeshadowState", "snapshotId", "StoryStateSnapshot"],
  ["ChapterPlanScene", "planId", "StoryPlan"], ["AuditIssue", "reportId", "AuditReport"],
  ["KnowledgeDocumentVersion", "documentId", "KnowledgeDocument"],
  ["DocumentChapter", "documentVersionId", "KnowledgeDocumentVersion"],
  ["BookAnalysisSection", "analysisId", "BookAnalysis"],
  ["BookAnalysisCharacter", "analysisId", "BookAnalysis"],
  ["BookAnalysisCharacterAppearance", "characterId", "BookAnalysisCharacter"],
  ["BookAnalysisCharacterAppearanceSnapshot", "appearanceId", "BookAnalysisCharacterAppearance"],
  ["BookAnalysisCharacterAppearanceTerm", "characterId", "BookAnalysisCharacter"],
  ["BookAnalysisCharacterAppearanceImage", "snapshotId", "BookAnalysisCharacterAppearanceSnapshot"],
  ["BookAnalysisCharacterArc", "characterId", "BookAnalysisCharacter"],
  ["BookAnalysisCharacterScene", "characterId", "BookAnalysisCharacter"],
  ["ChapterPolishMutation", "revisionId", "ChapterPolishRevision"],
];
const COMMON_REFS: Record<string, string> = {
  novelId: "Novel", chapterId: "Chapter", characterId: "Character", baseCharacterId: "BaseCharacter",
  sourceChapterId: "Chapter", resolvedChapterId: "Chapter", createdInChapterId: "Chapter",
  resolvedInChapterId: "Chapter", sourceWorldId: "World", sourceAnalysisId: "BookAnalysis",
  sourceIssueId: "AuditIssue", replannedFromPlanId: "StoryPlan",
};
const SPECIFIC_REFS: Record<string, Record<string, string>> = {
  PromptTemplateOverride: { activeVersionId: "PromptTemplateVersion" },
  Character: { baseCharacterId: "BaseCharacter" },
  StateChangeProposal: { sourceSnapshotId: "StoryStateSnapshot" },
  CharacterConversationSession: { legacyDialogueSessionId: "CharacterDialogueSession" },
};
export function sourceReferenceModel(model: string, row: BackupRow): string | undefined {
  if (model !== "StyleProfile") return undefined;
  return ({ from_book_analysis: "BookAnalysis", from_knowledge_document: "KnowledgeDocument" } as Record<string, string>)[String(row.sourceType)];
}
export function references(model: string, row: BackupRow): Record<string, string> {
  const result = { ...BACKUP_MODELS[model].refs, ...SPECIFIC_REFS[model] };
  for (const [field, target] of Object.entries(COMMON_REFS)) {
    if (field in BACKUP_MODELS[model].fields && !result[field]) result[field] = target;
  }
  const sourceModel = sourceReferenceModel(model, row);
  if (sourceModel) result.sourceRefId = sourceModel;
  if (model === "StyleBinding" || model === "KnowledgeBinding") {
    const target = { novel: "Novel", chapter: "Chapter", world: "World" }[String(row.targetType)];
    if (!target) invalid(`${model}绑定范围不属于单书。`);
    result.targetId = target;
  }
  if (model === "CharacterConversationSession") {
    if (row.scopeKind !== "novel" || row.subjectKind !== "novel_character") invalid("角色对话不属于本书角色范围。");
    result.scopeId = "Novel";
    result.subjectId = "Character";
  }
  if (model === "InformationState" && row.holderType === "character") result.holderRefId = "Character";
  if (model === "CharacterResourceLedgerItem" && row.ownerType === "character") result.ownerId = "Character";
  return result;
}
export function isSeed(model: string, row: BackupRow, novelId: string, chapterIds: Set<string>): boolean {
  if (model === "Novel") return row.id === novelId;
  if (SHELL_MODELS.has(model)) return false;
  if (row.novelId === novelId) return true;
  if ((model === "StyleBinding" || model === "KnowledgeBinding") && row.targetType === "novel" && row.targetId === novelId) return true;
  if (model === "StyleBinding" && row.targetType === "chapter") return chapterIds.has(String(row.targetId));
  return model === "CharacterConversationSession" && row.scopeKind === "novel" && row.scopeId === novelId;
}
export function imageReferences(row: BackupRow): string[] {
  return Object.values(row).flatMap((value) => typeof value === "string" ? [...value.matchAll(/\/api\/images\/assets\/([A-Za-z0-9_-]+)\/file/g)].map((match) => match[1]) : []);
}
export function verifyClosure(tables: BackupTables, novelId: string): void {
  const index = new Map<string, BackupRow>();
  for (const [model, rows] of Object.entries(tables)) for (const row of rows) index.set(`${model}:${row.id}`, row);
  const reached = new Set<string>();
  const chapterIds = new Set((tables.Chapter ?? []).map((row) => row.id));
  for (const [model, rows] of Object.entries(tables)) for (const row of rows) {
    if (typeof row.novelId === "string" && row.novelId !== novelId) invalid(`${model}引用了其他作品。`);
    for (const [field, target] of Object.entries(references(model, row))) {
      const value = row[field];
      if (value == null || value === "") continue;
      if (!index.has(`${target}:${value}`)) invalid(`${model}.${field}缺少对应资产。`);
    }
    if (isSeed(model, row, novelId, chapterIds)) reached.add(`${model}:${row.id}`);
  }
  let changed = true;
  while (changed) {
    changed = false;
    const add = (key: string) => { if (!reached.has(key)) { reached.add(key); changed = true; } };
    for (const [model, rows] of Object.entries(tables)) for (const row of rows) {
      if (reached.has(`${model}:${row.id}`)) {
        for (const id of imageReferences(row)) {
          if (!index.has(`ImageAsset:${id}`)) invalid("资料引用的受管图片未携带。");
          add(`ImageAsset:${id}`);
        }
        for (const [field, target] of Object.entries(references(model, row))) if (row[field]) add(`${target}:${row[field]}`);
      }
      if (model === "KnowledgeBinding" && row.targetType === "world" && reached.has(`World:${row.targetId}`)) add(`${model}:${row.id}`);
      for (const [child, field, parent] of CHILD_EDGES) {
        if (model === child && row[field] && reached.has(`${parent}:${row[field]}`)) add(`${model}:${row.id}`);
      }
    }
  }
  if ([...index.keys()].some((key) => !reached.has(key))) invalid("含有与本书无关的附加资产。");
}
