import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateRecipeImageAssets } from "../server/recipe-assets.mjs";

const configPath = fileURLToPath(new URL("./recipe-seed-images.json", import.meta.url));
const builtinRecipeImages = JSON.parse(readFileSync(configPath, "utf8"));
const additionsPath = fileURLToPath(new URL("./recipe-seed-additions.json", import.meta.url));
const additions = JSON.parse(readFileSync(additionsPath, "utf8"));
validateRecipeImageAssets([...builtinRecipeImages, ...additions], path.resolve(process.cwd(), "public", "recipes"));
