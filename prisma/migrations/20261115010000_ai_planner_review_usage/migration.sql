ALTER TABLE "Recipe" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'builtin';
ALTER TABLE "Recipe" ADD COLUMN "review_status" TEXT NOT NULL DEFAULT 'approved';
CREATE TABLE "AiUsage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "model" TEXT NOT NULL,
  "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
  "completion_tokens" INTEGER NOT NULL DEFAULT 0,
  "duration_ms" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AiUsage_created_at_idx" ON "AiUsage"("created_at");
CREATE INDEX "AiUsage_status_created_at_idx" ON "AiUsage"("status", "created_at");
