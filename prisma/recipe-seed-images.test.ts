import { describe, expect, it } from "vitest";
import path from "node:path";
import builtinRecipeImages from "@/prisma/recipe-seed-images.json";
import additions from "@/prisma/recipe-seed-additions.json";
import { validateRecipeImageAssets } from "@/server/recipe-assets.mjs";

describe("built-in recipe image configuration", () => {
  it("contains 30 recipes with no configured image URLs until local assets are supplied", () => {
    expect(builtinRecipeImages).toHaveLength(30);
    expect(builtinRecipeImages.every((recipe) => recipe.image_url === "")).toBe(true);
    expect(() => validateRecipeImageAssets(builtinRecipeImages, path.resolve(process.cwd(), "public", "recipes"))).not.toThrow();
  });

  it("adds distinct recipes with complete steps and validated local cover configuration", () => {
    const names = [...builtinRecipeImages, ...additions].map((recipe) => recipe.name);
    expect(new Set(names).size).toBe(names.length);
    expect(additions.filter((recipe) => recipe.meal_type === "breakfast").length).toBeGreaterThanOrEqual(10);
    for (const meal of ["lunch", "dinner"]) {
      expect(additions.filter((recipe) => recipe.meal_type === meal).length).toBeGreaterThanOrEqual(6);
    }
    expect(additions.every((recipe) => recipe.steps.length >= 3 && recipe.ingredients.length > 0)).toBe(true);
    expect(() => validateRecipeImageAssets(additions, path.resolve(process.cwd(), "public", "recipes"))).not.toThrow();
  });
});
