ALTER TABLE "Novel" ADD COLUMN "directorTokenBudget" INTEGER;
ALTER TABLE "Novel" ADD COLUMN "directorTokenBudgetWarnRatio" REAL NOT NULL DEFAULT 0.8;
