// Static whitelist: ownership changes require review, not automatic runtime discovery.
import type { BackupModel } from "./catalogTypes";
export type { BackupField, BackupModel } from "./catalogTypes";
import { bookModels } from "./schema/book";
import { charactersModels } from "./schema/characters";
import { styleModels } from "./schema/style";
import { worldModels } from "./schema/world";
import { planningModels } from "./schema/planning";
import { stateModels } from "./schema/state";
import { knowledgeModels } from "./schema/knowledge";
import { provenanceModels } from "./schema/provenance";
export const BACKUP_MODELS: Record<string, BackupModel> = {
  ...bookModels,
  ...charactersModels,
  ...styleModels,
  ...worldModels,
  ...planningModels,
  ...stateModels,
  ...knowledgeModels,
  ...provenanceModels,
};
export const SCHEMA_SIGNATURE = "d8eb8625fae74e2a9dd440d45b38faa6e8899c46cb03b1df74a5d5656d19ce4b";
export const KNOWN_SCHEMA_MODELS = ["APIKey","AgentApproval","AgentRun","AgentStep","AntiAiRule","AppSetting","AuditIssue","AuditReport","AutoDirectorAutoApprovalRecord","AutoDirectorFollowUpActionLog","AutoDirectorFollowUpNotificationLog","BaseCharacter","BaseCharacterRevision","BookAnalysis","BookAnalysisCharacter","BookAnalysisCharacterAppearance","BookAnalysisCharacterAppearanceImage","BookAnalysisCharacterAppearanceSnapshot","BookAnalysisCharacterAppearanceTerm","BookAnalysisCharacterArc","BookAnalysisCharacterScene","BookAnalysisSection","BookAnalysisSourceCache","BookContract","CanonicalStateVersion","Chapter","ChapterArtifactSyncCheckpoint","ChapterPlanScene","ChapterPolishMutation","ChapterPolishRevision","ChapterSummary","ChapterTimeAnchor","Character","CharacterCandidate","CharacterCastOption","CharacterCastOptionMember","CharacterCastOptionRelation","CharacterConversationSession","CharacterConversationTurn","CharacterDialogueInfluence","CharacterDialogueSession","CharacterDialogueTurn","CharacterFactionTrack","CharacterInfluenceProposal","CharacterLibraryLink","CharacterMindSnapshot","CharacterRelation","CharacterRelationStage","CharacterResourceEvent","CharacterResourceLedgerItem","CharacterState","CharacterSyncProposal","CharacterTimeline","CharacterVolumeAssignment","ComicBatchJob","ComicCharacter","ComicCharacterAsset","ComicEpisode","ComicExportJob","ComicFact","ComicPanel","ComicProject","ComicScene","ComicSourceBundle","ComicUploadAsset","ConsistencyFact","CreationStudioConfirmation","CreativeDecision","CreativeHubCheckpoint","CreativeHubThread","DirectorArtifact","DirectorArtifactDependency","DirectorEvent","DirectorLlmUsageRecord","DirectorRun","DirectorRunCommand","DirectorRuntimeCheckpoint","DirectorRuntimeCommand","DirectorRuntimeEvent","DirectorRuntimeExecution","DirectorRuntimeInstance","DirectorStepRun","DocumentChapter","DramaBatchJob","DramaCharacter","DramaCharacterLibrary","DramaEpisode","DramaFact","DramaProject","DramaShot","DramaSourceBundle","DramaStoryboard","DramaVideoPrompt","ForeshadowState","GenerationJob","ImageAsset","ImageGenerationTask","InformationState","KnowledgeBinding","KnowledgeChunk","KnowledgeDocument","KnowledgeDocumentVersion","ModelRouteConfig","Novel","NovelBackupImportReceipt","NovelBible","NovelFactEntry","NovelGenre","NovelIntentVersion","NovelSideEffectJob","NovelSnapshot","NovelStoryMode","NovelWorkflowTask","NovelWorld","OpenConflict","PayoffLedgerItem","PlotBeat","PromptAddendum","PromptSlotOverride","PromptTemplateOverride","PromptTemplateVersion","QualityReport","RagIndexJob","RagRetrievalTrace","RelationState","ReplanRun","ShortStoryPlan","ShortStorySegment","StateChangeProposal","StoryMacroPlan","StoryPlan","StoryStateSnapshot","StoryTimelineEvent","StorylineVersion","StyleBinding","StyleExtractionTask","StyleProfile","StyleProfileAntiAiRule","StyleTemplate","TaskCenterArchive","TimelineCheckReport","TimelineConstraint","TimelineHook","TitleLibrary","VisualAssetProjection","VolumeChapterPlan","VolumePlan","VolumePlanVersion","World","WorldAsset","WorldConsistencyIssue","WorldDeepeningQA","WorldPropertyLibrary","WorldSnapshot","WorldSyncRecord","WritingFormula","WritingPlatformProfileOverride","WritingPlatformProfileVersion"];
export const BACKUP_ENUMS: Record<string, string[]> = {
  ChapterGenerationState: ["planned","drafted","reviewed","repaired","approved","published"],
  PipelineJobStatus: ["queued","running","succeeded","failed","cancelled"],
  BeatStatus: ["planned","completed","skipped"],
  FactCategory: ["world","character","timeline","plot","rule"],
  RagOwnerType: ["novel","chapter","world","character","bible","chapter_summary","consistency_fact","character_timeline","world_library_item","knowledge_document","chat_message"],
  RagJobType: ["upsert","delete","rebuild"],
  RagJobStatus: ["queued","running","succeeded","failed","cancelled"],
  KnowledgeDocumentStatus: ["enabled","disabled","archived"],
  KnowledgeDocumentKind: ["user_upload","analysis_published"],
  KnowledgeIndexStatus: ["idle","queued","running","succeeded","failed"],
  KnowledgeBindingTargetType: ["novel","world"],
  BookAnalysisStatus: ["draft","queued","running","succeeded","failed","cancelled","archived"],
  BookAnalysisSectionStatus: ["idle","running","succeeded","failed"],
  ImageSceneType: ["character","novel_cover","chapter_illustration","book_analysis_character"],
  ProjectMode: ["ai_led","co_pilot","draft_mode","auto_pipeline"],
  CreationExperience: ["simple","professional"],
  NarrativePov: ["first_person","third_person","mixed"],
  PacePreference: ["slow","balanced","fast"],
  EmotionIntensity: ["low","medium","high"],
  AIFreedom: ["low","medium","high"],
  ProjectProgressStatus: ["not_started","in_progress","completed","rework","blocked"],
  StorylineVersionStatus: ["draft","active","frozen"],
  VolumePlanVersionStatus: ["draft","active","frozen"],
  ChapterStatus: ["unplanned","pending_generation","generating","pending_review","needs_repair","completed"],
  PipelineRunMode: ["fast","polish"],
  PipelineRepairMode: ["detect_only","light_repair","heavy_repair","continuity_only","character_only","ending_only"],
  AgentRunStatus: ["queued","running","waiting_approval","succeeded","failed","cancelled"],
  NovelWorkflowLane: ["manual_create","auto_director","creation_studio"],
  NarrativeForm: ["short_story","long_novel"],
  NovelWorkflowTaskStatus: ["queued","running","waiting_approval","succeeded","failed","cancelled"],
  AgentStepType: ["planning","tool_call","tool_result","reasoning","write","approval","answer"],
  AgentStepStatus: ["pending","running","succeeded","failed","cancelled"],
  AgentApprovalStatus: ["pending","approved","rejected","expired"],
  CreativeHubThreadStatus: ["idle","busy","interrupted","error"],
  StoryPlanLevel: ["book","arc","chapter"],
  StoryPlanRole: ["setup","progress","pressure","turn","payoff","cooldown"],
  AuditType: ["continuity","character","plot","mode_fit"],
  AuditIssueStatus: ["open","resolved","ignored"],
  PayoffLedgerScopeType: ["book","volume","chapter"],
  PayoffLedgerStatus: ["setup","hinted","pending_payoff","paid_off","failed","overdue"],
  StyleBindingTargetType: ["novel","chapter","task"],
  AntiAiRuleType: ["forbidden","risk","encourage"],
  AntiAiSeverity: ["low","medium","high"],
  CharacterGender: ["male","female","other","unknown"],
};
