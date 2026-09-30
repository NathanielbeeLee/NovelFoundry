import { type BackupTables, invalid } from "./archive";

// Only keys whose product contract denotes persisted entities are strict references.
// modelId/providerId/promptId, scene ids and world force/location ids are NOT database identities.
const TARGETS: Record<string, string> = {
  novelId: "Novel", chapterId: "Chapter", sourceChapterId: "Chapter", characterId: "Character",
  sourceCharacterId: "Character", targetCharacterId: "Character", ownerCharacterId: "Character",
  holderCharacterId: "Character", actorCharacterId: "Character", fromHolderCharacterId: "Character",
  toHolderCharacterId: "Character", knownByCharacterIds: "Character", knownByCharacterIdsJson: "Character",
  affectedCharacterIds: "Character", affectedCharacterIdsJson: "Character", relatedCharacterIds: "Character",
  relatedCharacterIdsJson: "Character", characterIds: "Character", participantIds: "Character", participantIdsJson: "Character",
  chapterIds: "Chapter", setupChapterId: "Chapter", payoffChapterId: "Chapter", lastTouchedChapterId: "Chapter",
  introducedChapterId: "Chapter", resolvedChapterId: "Chapter", createdInChapterId: "Chapter", resolvedInChapterId: "Chapter",
  currentChapterId: "Chapter", currentVolumeId: "VolumePlan", volumeId: "VolumePlan", resourceId: "CharacterResourceLedgerItem",
  worldId: "World", novelWorldId: "NovelWorld", documentId: "KnowledgeDocument", documentVersionId: "KnowledgeDocumentVersion",
  imageAssetId: "ImageAsset", imageAssetIds: "ImageAsset", referenceImageAssetIds: "ImageAsset", referenceImageAssetIdsJson: "ImageAsset",
  relatedEventIds: "StoryTimelineEvent", relatedEventIdsJson: "StoryTimelineEvent", prerequisiteIdsJson: "StoryTimelineEvent",
  consequenceIdsJson: "StoryTimelineEvent", plannedEventIdsJson: "StoryTimelineEvent", startsAfterIdsJson: "StoryTimelineEvent",
  endedWithIdsJson: "StoryTimelineEvent", forbiddenEventIdsJson: "StoryTimelineEvent", relatedHookIdsJson: "TimelineHook",
  previousHookIdsJson: "TimelineHook", nextHookIdsJson: "TimelineHook",
};
const READ_ONLY_HISTORY = new Set(["snapshotData", "snapshotJson", "rawStateJson", "beforeJson", "afterJson", "sourceSnapshotJson", "humanSnapshotJson"]);
export function buildJsonReferenceIndex(tables: BackupTables): Map<string, Set<string>> {
  return new Map(Object.entries(tables).map(([model, rows]) => [model, new Set(rows.map((row) => row.id))]));
}
export function validateJsonEntityReferences(index: Map<string, Set<string>>, model: string, field: string, value: unknown): void {
  if (READ_ONLY_HISTORY.has(field) || model === "PromptTemplateVersion" || model === "StyleProfile") return;
  const visit = (item: unknown, key: string, depth: number): void => {
    if (depth > 64) invalid("资料嵌套过深。");
    const target = TARGETS[key];
    if (typeof item === "string" && item && target && !index.get(target)?.has(item)) {
      invalid(`${model}.${field}引用了未携带的${target}资产。`);
    }
    if (Array.isArray(item)) item.forEach((entry) => visit(entry, key, depth + 1));
    else if (item && typeof item === "object") Object.entries(item).forEach(([child, entry]) => visit(entry, child, depth + 1));
  };
  visit(value, field, 0);
}
