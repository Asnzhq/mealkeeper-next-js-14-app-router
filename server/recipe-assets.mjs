import { existsSync, statSync } from "node:fs";
import path from "node:path";

export function validateRecipeImageAssets(recipes, publicRecipesDirectory) {
  const root = path.resolve(publicRecipesDirectory);
  for (const recipe of recipes) {
    if (!recipe.image_url) continue;
    let decodedPath;
    try {
      decodedPath = decodeURIComponent(recipe.image_url);
    } catch {
      throw new Error(`菜谱“${recipe.name}”的图片路径编码无效：${recipe.image_url}`);
    }
    if (!decodedPath.startsWith("/recipes/")) {
      throw new Error(`菜谱“${recipe.name}”必须使用本地路径 /recipes/...：${recipe.image_url}`);
    }
    const target = path.resolve(root, decodedPath.slice("/recipes/".length));
    const relative = path.relative(root, target);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`菜谱“${recipe.name}”的图片必须位于 public/recipes：${recipe.image_url}`);
    }
    if (!existsSync(target) || !statSync(target).isFile()) {
      throw new Error(`菜谱“${recipe.name}”的图片文件不存在：${recipe.image_url}（${target}）`);
    }
  }
}
