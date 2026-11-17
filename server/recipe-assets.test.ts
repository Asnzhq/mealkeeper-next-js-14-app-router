import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { validateRecipeImageAssets } from "@/server/recipe-assets.mjs";

let temporaryRoot = "";
afterEach(async () => {
  if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
  temporaryRoot = "";
});

describe("validateRecipeImageAssets", () => {
  it("accepts empty covers and existing files under public/recipes", async () => {
    temporaryRoot = await mkdtemp(path.join(tmpdir(), "mealkeeper-recipe-assets-"));
    const publicRecipes = path.join(temporaryRoot, "public", "recipes");
    await mkdir(publicRecipes, { recursive: true });
    await writeFile(path.join(publicRecipes, "soup.webp"), "image");

    expect(() => validateRecipeImageAssets([
      { name: "无封面菜", image_url: "" },
      { name: "汤", image_url: "/recipes/soup.webp" },
    ], publicRecipes)).not.toThrow();
  });

  it("fails with the recipe name and path when a configured file is missing", async () => {
    temporaryRoot = await mkdtemp(path.join(tmpdir(), "mealkeeper-recipe-assets-"));
    const publicRecipes = path.join(temporaryRoot, "public", "recipes");
    await mkdir(publicRecipes, { recursive: true });

    expect(() => validateRecipeImageAssets([{ name: "番茄炒蛋", image_url: "/recipes/tomato.webp" }], publicRecipes))
      .toThrow(/番茄炒蛋.*\/recipes\/tomato\.webp/);
  });

  it("rejects external URLs and paths escaping public/recipes", async () => {
    temporaryRoot = await mkdtemp(path.join(tmpdir(), "mealkeeper-recipe-assets-"));
    const publicRecipes = path.join(temporaryRoot, "public", "recipes");
    await mkdir(publicRecipes, { recursive: true });

    expect(() => validateRecipeImageAssets([{ name: "外链菜", image_url: "https://example.invalid/image.webp" }], publicRecipes))
      .toThrow(/必须使用本地路径/);
    expect(() => validateRecipeImageAssets([{ name: "越界菜", image_url: "/recipes/..%2Fsecret.webp" }], publicRecipes))
      .toThrow(/必须位于 public\/recipes/);
  });
});
