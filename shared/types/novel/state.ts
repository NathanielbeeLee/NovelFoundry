export interface CharacterState {
  id: string;
  snapshotId: string;
  characterId: string;
  currentGoal?: string | null;
  emotion?: string | null;
  stressLevel?: number | null;
  secretExposure?: string | null;
  knownFactsJson?: string | null;
  misbeliefsJson?: string | null;
  summary?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RelationState {
  id: string;
  snapshotId: string;
  sourceCharacterId: string;
  targetCharacterId: string;
  trustScore?: number | null;
  intimacyScore?: number | null;
  conflictScore?: number | null;
  dependencyScore?: number | null;
  summary?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InformationState {
  id: string;
  snapshotId: string;
  holderType: string;
  holderRefId?: string | null;
  fact: string;
  status: string;
  summary?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ForeshadowState {
  id: string;
  snapshotId: string;
  title: string;
  summary?: string | null;
  status: string;
  setupChapterId?: string | null;
  payoffChapterId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoryStateSnapshot {
  id: string;
  novelId: string;
  sourceChapterId?: string | null;
  summary?: string | null;
  rawStateJson?: string | null;
  characterStates: CharacterState[];
  relationStates: RelationState[];
  informationStates: InformationState[];
  foreshadowStates: ForeshadowState[];
  createdAt: string;
  updatedAt: string;
}

export interface OpenConflict {
  id: string;
  novelId: string;
  chapterId?: string | null;
  sourceSnapshotId?: string | null;
  sourceIssueId?: string | null;
  sourceType: string;
  conflictType: string;
  conflictKey: string;
  title: string;
  summary: string;
  severity: string;
  status: string;
  evidenceJson?: string | null;
  affectedCharacterIdsJson?: string | null;
  resolutionHint?: string | null;
  lastSeenChapterOrder?: number | null;
  createdAt: string;
  updatedAt: string;
}
