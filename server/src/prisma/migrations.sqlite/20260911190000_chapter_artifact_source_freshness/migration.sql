-- Applied once by Prisma migration ledger (SQLite has no ADD COLUMN IF NOT EXISTS).
ALTER TABLE "ChapterSummary" ADD COLUMN "sourceContentHash" TEXT;
ALTER TABLE "StoryStateSnapshot" ADD COLUMN "sourceContentHash" TEXT;
ALTER TABLE "NovelFactEntry" ADD COLUMN "sourceContentHash" TEXT;
