ALTER TABLE "Character" ADD COLUMN "importanceTier" TEXT NOT NULL DEFAULT 'named';
ALTER TABLE "CharacterCastOptionMember" ADD COLUMN "importanceTier" TEXT NOT NULL DEFAULT 'named';
UPDATE "Character" SET "importanceTier" = CASE
  WHEN "castRole" = 'protagonist' THEN 'lead'
  WHEN "castRole" IN ('antagonist', 'ally', 'mentor', 'love_interest', 'pressure_source') THEN 'major'
  ELSE 'named'
END;
CREATE INDEX "Character_novelId_importanceTier_idx" ON "Character"("novelId", "importanceTier");
