CREATE TABLE IF NOT EXISTS "NovelBackupImportReceipt" (
  "requestId" TEXT NOT NULL PRIMARY KEY,
  "novelId" TEXT NOT NULL,
  "digest" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "NovelBackupImportReceipt_novelId_idx" ON "NovelBackupImportReceipt"("novelId");
