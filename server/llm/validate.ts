import type { DishType, GenerateMealsInput, MealType, PlannerRecipe } from "@/lib/planner/types";
import { classifyRecipe } from "@/lib/planner/generate-meals";
import type { MealsOutput } from "@/server/llm/schema";

const meatWords = ["肉", "鸡", "鸭", "牛", "猪", "羊", "鱼", "虾", "蟹", "培根", "火腿"];
const normalize = (value: string) => value.toLocaleLowerCase().trim();

export function validateAiMeals(output: MealsOutput, input: GenerateMealsInput): string | null {
  const requested = new Set<MealType>(input.mealTypes ?? ["breakfast", "lunch", "dinner"]);
  const returned = new Set<MealType>(output.meals.map((meal) => meal.meal_type));
  if ([...requested].some((mealType) => !returned.has(mealType))) return "模型结果缺少请求的餐次";
  const recent = new Set(input.recentRecipeIds ?? []);
  const usedAcrossMeals = new Set<string>();
  const usedNames = new Set<string>();
  const prefs = input.preferences ?? {};
  for (const meal of output.meals) {
    if (!requested.has(meal.meal_type)) return "模型返回了未请求的餐次";
    const resolvedIds = meal.recipes.map((item) => item.recipe_id ?? input.recipes.find((recipe) => normalize(recipe.name) === normalize(item.name))?.id ?? `ai:${normalize(item.name)}`);
    if (resolvedIds.some((id) => recent.has(id) || usedAcrossMeals.has(id)) || new Set(resolvedIds).size !== resolvedIds.length) return "模型重复使用了近期菜谱";
    resolvedIds.forEach((id) => usedAcrossMeals.add(id));
    const projected: PlannerRecipe[] = meal.recipes.map((item) => ({ id: item.recipe_id ?? `ai:${item.name}`, name: item.name, meal_type: meal.meal_type, ingredients: item.ingredients.map((ingredient) => ({ ...ingredient, ingredient_id: ingredient.ingredient_id ?? undefined })), duration_min: item.duration_min, tags: item.tags, nutrition: { calories: item.calories ?? 0 }, cookware_required: item.cookware_required }));
    const banned = [...(prefs.avoid ?? []), ...(prefs.allergies ?? [])].map(normalize).filter(Boolean);
    for (const recipe of projected) {
      const text = [recipe.name, ...recipe.tags, ...recipe.ingredients.map((ingredient) => ingredient.name)].map(normalize);
      if (banned.some((term) => text.some((value) => value.includes(term)))) return "模型结果包含忌口或过敏食材";
      if (prefs.vegetarian && (classifyRecipe(recipe) === "meat" || recipe.ingredients.some((ingredient) => meatWords.some((word) => ingredient.name.includes(word))))) return "模型结果不符合素食偏好";
      if (prefs.availableCookware && recipe.cookware_required?.some((tool) => !prefs.availableCookware?.includes(tool))) return "模型结果包含不可用厨具";
    }
    if (prefs.maxCookingMinutes !== undefined && projected.reduce((sum, recipe) => sum + recipe.duration_min, 0) > prefs.maxCookingMinutes) return "模型结果超过烹饪时长上限";
    if (prefs.calorieTarget !== undefined) {
      const calories = projected.reduce((sum, recipe) => sum + (recipe.nutrition?.calories ?? 0), 0);
      if (calories && (calories < prefs.calorieTarget * 0.85 || calories > prefs.calorieTarget * 1.15)) return "模型结果不符合热量范围";
    }
    const requiredCategories: DishType[] = input.requiredComposition?.[meal.meal_type] ?? (["lunch", "dinner"].includes(meal.meal_type) ? ["meat", "vegetable", "staple"] : []);
    if (requiredCategories.length > 0) {
      const categories: DishType[] = projected.map(classifyRecipe);
      if (requiredCategories.some((category) => categories.filter((candidate) => candidate === category).length < requiredCategories.filter((required) => required === category).length)) return "模型结果不符合餐次荤素主食组成";
      const mains = projected.flatMap((recipe) => recipe.ingredients.filter((item) => item.role === "main").map((item) => item.ingredient_id ?? normalize(item.name)));
      if (new Set(mains).size !== mains.length) return "同一餐的主料不能重复";
    }
  }
  return null;
}
