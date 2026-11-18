-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Recipe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "family_id" TEXT,
    "name" TEXT NOT NULL,
    "meal_type" TEXT NOT NULL,
    "ingredients" JSONB NOT NULL,
    "steps" JSONB NOT NULL,
    "duration_min" INTEGER NOT NULL,
    "tags" JSONB NOT NULL DEFAULT [],
    "nutrition" JSONB,
    "image_url" TEXT,
    "source" TEXT NOT NULL DEFAULT 'builtin',
    "review_status" TEXT NOT NULL DEFAULT 'approved',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "Recipe_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "Family" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Recipe" ("created_at", "duration_min", "family_id", "id", "image_url", "ingredients", "meal_type", "name", "nutrition", "review_status", "source", "steps", "tags", "updated_at") SELECT "created_at", "duration_min", "family_id", "id", "image_url", "ingredients", "meal_type", "name", "nutrition", "review_status", "source", "steps", "tags", "updated_at" FROM "Recipe";
DROP TABLE "Recipe";
ALTER TABLE "new_Recipe" RENAME TO "Recipe";
CREATE INDEX "Recipe_meal_type_idx" ON "Recipe"("meal_type");
CREATE INDEX "Recipe_name_idx" ON "Recipe"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


UPDATE "Recipe" SET "image_url" = NULL WHERE "image_url" = '';
