ALTER TABLE "Recipe" ALTER COLUMN "image_url" DROP NOT NULL;

UPDATE "Recipe" SET "image_url" = NULL WHERE "image_url" = '';
