CREATE TABLE IF NOT EXISTS "NovelFactEntry" (
  "id" TEXT NOT NULL,
  "novelId" TEXT NOT NULL,
  "chapterOrder" INTEGER NOT NULL,
  "text" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'completed',
  "source" TEXT NOT NULL DEFAULT 'auto',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "NovelFactEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NovelFactEntry_novelId_chapterOrder_idx"
  ON "NovelFactEntry"("novelId", "chapterOrder");
CREATE INDEX IF NOT EXISTS "NovelFactEntry_novelId_category_idx"
  ON "NovelFactEntry"("novelId", "category");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'NovelFactEntry_novelId_fkey' AND conrelid = '"NovelFactEntry"'::regclass) THEN
    ALTER TABLE "NovelFactEntry" ADD CONSTRAINT "NovelFactEntry_novelId_fkey"
      FOREIGN KEY ("novelId") REFERENCES "Novel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
