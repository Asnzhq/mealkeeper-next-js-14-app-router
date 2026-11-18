import { Prisma, PrismaClient } from "@prisma/client";
import path from "node:path";
import builtinRecipeImages from "@/prisma/recipe-seed-images.json";
import newRecipes from "@/prisma/recipe-seed-additions.json";
import { validateRecipeImageAssets } from "@/server/recipe-assets.mjs";

const prisma = new PrismaClient();
const mealTypes = ["breakfast", "lunch", "dinner", "lunch", "dinner", "lunch", "dinner", "lunch", "dinner", "lunch", "dinner", "lunch", "breakfast", "dinner", "lunch", "dinner", "lunch", "dinner", "lunch", "dinner", "lunch", "dinner", "lunch", "dinner", "lunch", "dinner", "lunch", "dinner", "lunch", "dinner"];
const dishTypes = ["素菜", "荤菜", "荤菜", "荤菜", "荤菜", "荤菜", "荤菜", "荤菜", "荤菜", "素菜", "荤菜", "主食", "主食", "素菜", "荤菜", "素菜", "素菜", "主食", "素菜", "荤菜", "素菜", "荤菜", "荤菜", "荤菜", "荤菜", "素菜", "荤菜", "荤菜", "荤菜", "荤菜"];
const ingredientNames = [
  ["鸡蛋", "番茄", "吐司"], ["五花肉", "生姜"], ["鸡胸肉", "花生", "黄瓜"], ["猪肉", "木耳", "胡萝卜"], ["猪肉", "青椒"],
  ["豆腐", "猪肉"], ["鸡翅", "可乐"], ["排骨", "冰糖"], ["牛肉", "土豆", "胡萝卜"], ["西兰花", "大蒜"],
  ["鲈鱼", "生姜"], ["大米", "鸡蛋", "虾仁"], ["大米", "鸡蛋"], ["紫菜", "鸡蛋"], ["排骨", "冬瓜"],
  ["豆腐", "香菇", "青菜"], ["茄子", "土豆", "青椒"], ["面条", "小葱"], ["茄子", "大蒜"], ["虾", "生姜"],
  ["土豆", "辣椒"], ["牛肉", "芹菜", "辣椒"], ["鸡肉", "香菇"], ["鸡肉", "土豆", "胡萝卜"], ["排骨", "玉米"],
  ["韭菜", "鸡蛋"], ["猪肉", "蒜苔"], ["牛腩", "番茄"], ["三文鱼", "西兰花"], ["虾仁", "鸡蛋"],
];
const quantities = [250, 300, 200, 200, 150, 250, 300, 300, 300, 200, 350, 250, 200, 100, 300, 250, 300, 200, 250, 250, 250, 250, 250, 300, 350, 180, 200, 350, 250, 200];
const steps = ["准备食材，清洗后切配；肉类擦干并提前调味。", "热锅加入少量油，先将主料煎炒至表面上色，再加入配料和调味汁。", "小火焖煮或翻炒至熟透入味，调整咸淡后装盘。"];

function buildSeedRecipes() {
  if (mealTypes.length !== builtinRecipeImages.length || dishTypes.length !== builtinRecipeImages.length || ingredientNames.length !== builtinRecipeImages.length || quantities.length !== builtinRecipeImages.length) {
    throw new Error("内置菜谱配置数组长度不一致");
  }
  return builtinRecipeImages.map(({ name, image_url }, index) => {
    const ingredients = ingredientNames[index]!.map((item, ingredientIndex) => ({
      name: item,
      quantity: ingredientIndex === 0 ? quantities[index]! : Math.max(40, Math.round(quantities[index]! / (ingredientIndex + 1))),
      unit: item.includes("蛋") ? "个" : item.includes("翅") ? "只" : item.includes("虾") ? "只" : item.includes("鱼") ? "只" : item.includes("米") ? "g" : item.includes("可乐") ? "ml" : "g",
      role: ingredientIndex === 0 ? "main" : "side",
    }));
    const recipe = {
      name,
      meal_type: mealTypes[index]!,
      ingredients,
      steps,
      duration_min: 18 + (index % 5) * 5,
      tags: ["中式", "家常", dishTypes[index]!],
      nutrition: { calories: mealTypes[index] === "breakfast" ? 700 : 250 + (index % 6) * 55 },
      image_url,
    };
    return { id: `seed-recipe-${index + 1}`, ...recipe };
  });
}

async function main() {
  const recipes = [...buildSeedRecipes(), ...newRecipes];
  validateRecipeImageAssets(recipes, path.resolve(process.cwd(), "public", "recipes"));
  for (const recipe of recipes) {
    const { id, image_url, ...data } = recipe;
    await prisma.recipe.upsert({
      where: { id },
      update: { ...data, imageUrl: image_url || undefined } as Prisma.RecipeUncheckedUpdateInput,
      create: { id, ...data, imageUrl: image_url || null } as Prisma.RecipeUncheckedCreateInput,
    });
  }
}

main().finally(() => prisma.$disconnect());
