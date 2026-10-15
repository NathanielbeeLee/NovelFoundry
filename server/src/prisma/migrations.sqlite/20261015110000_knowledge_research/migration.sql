-- Additive and repeat-safe; no existing document or novel data is changed.
CREATE TABLE IF NOT EXISTS "KnowledgeResearchSource" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "documentVersionId" TEXT NOT NULL,
 "title" TEXT NOT NULL,
 "url" TEXT,
 "author" TEXT,
 "accessedAt" DATETIME,
 "reliabilityReason" TEXT NOT NULL,
 "enabled" BOOLEAN NOT NULL DEFAULT true,
 "revision" TEXT NOT NULL,
 "contentHash" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" DATETIME NOT NULL,
 CONSTRAINT "KnowledgeResearchSource_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "KnowledgeDocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeResearchSource_documentVersionId_key" ON "KnowledgeResearchSource"("documentVersionId");
CREATE TABLE IF NOT EXISTS "KnowledgeResearchFinding" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "sourceId" TEXT NOT NULL,
 "sourceRevision" TEXT NOT NULL,
 "contentHash" TEXT NOT NULL,
 "claim" TEXT NOT NULL,
 "quote" TEXT NOT NULL,
 "startOffset" INTEGER NOT NULL,
 "endOffset" INTEGER NOT NULL,
 "uncertainty" TEXT NOT NULL,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "KnowledgeResearchFinding_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeResearchSource"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "KnowledgeResearchFinding_offsets_check" CHECK ("startOffset" >= 0 AND "endOffset" > "startOffset")
);
CREATE INDEX IF NOT EXISTS "KnowledgeResearchFinding_sourceId_sourceRevision_idx" ON "KnowledgeResearchFinding"("sourceId", "sourceRevision");
CREATE TABLE IF NOT EXISTS "KnowledgeResearchAdoption" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "findingId" TEXT NOT NULL,
 "novelId" TEXT NOT NULL,
 "revokedAt" DATETIME,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" DATETIME NOT NULL,
 CONSTRAINT "KnowledgeResearchAdoption_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "KnowledgeResearchFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "KnowledgeResearchAdoption_novelId_fkey" FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeResearchAdoption_findingId_novelId_key" ON "KnowledgeResearchAdoption"("findingId", "novelId");
CREATE INDEX IF NOT EXISTS "KnowledgeResearchAdoption_novelId_revokedAt_idx" ON "KnowledgeResearchAdoption"("novelId", "revokedAt");
