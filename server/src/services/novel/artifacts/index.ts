export { ChapterArtifactDeltaService, chapterArtifactDeltaService } from "./application/ChapterArtifactDeltaService";
export { buildContentHash } from "./domain/ChapterSourceIdentity";
export { mergeKnowledgeBoundaryState } from "./domain/ChapterArtifactMapping";
export type { ChapterArtifactDeltaSyncInput, ChapterArtifactDeltaSyncResult } from "./domain/ChapterArtifactMapping";
export { artifactPrisma, currentChapterSource, runWithChapterSource, StaleChapterSourceError } from "./infrastructure/ChapterSourceTransaction";
