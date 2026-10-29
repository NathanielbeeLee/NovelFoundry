export interface SavedChapter {
  id: string;
  novelId: string;
  content: string | null;
  updatedAt: Date;
}

export interface SavedSummary {
  summary: string;
  keyEvents: string | null;
  characterStates: string | null;
  hook: string | null;
  sourceContentHash: string | null;
  updatedAt: Date;
}

export interface SyncCheckpoint {
  contentHash: string;
  artifactType: string;
  syncMode: string;
  status: string;
  metadataJson: string | null;
  updatedAt: Date;
}

export interface IndexJobEvidence {
  ownerType: string;
  status: string;
  payloadJson: string | null;
  updatedAt: Date;
}

export interface IndexChunkEvidence {
  ownerType: string;
  metadataJson: string | null;
  indexedAt: Date | null;
}

export interface ChapterSyncSnapshot {
  chapter: SavedChapter;
  summary: SavedSummary | null;
  checkpoints: SyncCheckpoint[];
  jobs: IndexJobEvidence[];
  chunks: IndexChunkEvidence[];
  /** Capped index evidence must never establish complete local index coverage. */
  truncatedChunkOwners: string[];
}

export interface ChapterSyncDiagnosticsReader {
  readSnapshot(novelId: string, chapterId: string): Promise<ChapterSyncSnapshot | null>;
  readSource(novelId: string, chapterId: string): Promise<{
    chapter: SavedChapter; summary: SavedSummary | null;
  } | null>;
}
