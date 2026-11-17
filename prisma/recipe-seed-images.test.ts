import { describe, expect, it } from "vitest";
import path from "node:path";
import builtinRecipeImages from "@/prisma/recipe-seed-images.json";
import { validateRecipeImageAssets } from "@/server/recipe-assets.mjs";

describe("built-in recipe image configuration", () => {
  it("contains 30 recipes with no configured image URLs until local assets are supplied", () => {
    expect(builtinRecipeImages).toHaveLength(30);
    expect(builtinRecipeImages.every((recipe) => recipe.image_url === "")).toBe(true);
    expect(() => validateRecipeImageAssets(builtinRecipeImages, path.resolve(process.cwd(), "public", "recipes"))).not.toThrow();
  });
});
