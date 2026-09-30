-- Additive, repeat-safe history tables. Existing novel data is preserved.
CREATE TABLE IF NOT EXISTS "ChapterPolishRevision" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "novelId" TEXT NOT NULL,
 "chapterId" TEXT NOT NULL,
 "generationJobId" TEXT,
 "operationKey" TEXT NOT NULL,
 "schemaVersion" INTEGER NOT NULL DEFAULT 1,
 "status" TEXT NOT NULL DEFAULT 'recording',
 "beforeContent" TEXT NOT NULL,
 "afterContent" TEXT,
 "beforeRawHash" TEXT NOT NULL,
 "afterRawHash" TEXT,
 "backupVerified" BOOLEAN NOT NULL DEFAULT false,
 "beforeChapterStateJson" TEXT,
 "afterChapterStateJson" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "completedAt" TIMESTAMP(3),
 "undoneAt" TIMESTAMP(3),
 "lastError" TEXT,
 CONSTRAINT "ChapterPolishRevision_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "ChapterPolishRevision_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "Chapter"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChapterPolishRevision_operationKey_key" ON "ChapterPolishRevision"("operationKey");
CREATE INDEX IF NOT EXISTS "ChapterPolishRevision_novelId_createdAt_idx" ON "ChapterPolishRevision"("novelId", "createdAt");
CREATE INDEX IF NOT EXISTS "ChapterPolishRevision_chapterId_createdAt_idx" ON "ChapterPolishRevision"("chapterId", "createdAt");
CREATE TABLE IF NOT EXISTS "ChapterPolishMutation" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "revisionId" TEXT NOT NULL,
 "sequence" INTEGER NOT NULL,
 "entityType" TEXT NOT NULL,
 "entityId" TEXT NOT NULL,
 "beforeJson" TEXT,
 "afterJson" TEXT,
 "beforeHash" TEXT,
 "afterHash" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ChapterPolishMutation_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "ChapterPolishRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChapterPolishMutation_revisionId_sequence_key" ON "ChapterPolishMutation"("revisionId", "sequence");
CREATE INDEX IF NOT EXISTS "ChapterPolishMutation_entityType_entityId_idx" ON "ChapterPolishMutation"("entityType", "entityId");
