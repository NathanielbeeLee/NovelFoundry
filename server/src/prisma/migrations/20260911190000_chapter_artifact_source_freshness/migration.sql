-- Source provenance only; existing data is preserved and refreshed on next extraction.
ALTER TABLE "ChapterSummary" ADD COLUMN IF NOT EXISTS "sourceContentHash" TEXT;
ALTER TABLE "StoryStateSnapshot" ADD COLUMN IF NOT EXISTS "sourceContentHash" TEXT;
ALTER TABLE "NovelFactEntry" ADD COLUMN IF NOT EXISTS "sourceContentHash" TEXT;
