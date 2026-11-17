import type { GenerateMealsInput, MealType, PlannerRecipe } from "@/lib/planner/types";
import { plannerHardConstraintFailure } from "@/lib/planner/generate-meals";
import type { MealsOutput } from "@/server/llm/schema";

export function validateAiMeals(output: MealsOutput, input: GenerateMealsInput): string | null {
  const requested = new Set<MealType>(input.mealTypes ?? ["breakfast", "lunch", "dinner"]);
  const returned = new Set<MealType>(output.meals.map((meal) => meal.meal_type));
  if ([...requested].some((mealType) => !returned.has(mealType))) return "模型结果缺少请求的餐次";
  for (const meal of output.meals) {
    if (!requested.has(meal.meal_type)) return "模型返回了未请求的餐次";
    for (const item of meal.recipes) {
      const recipe: PlannerRecipe = {
        id: item.recipe_id ?? `ai:${item.name}`,
        name: item.name,
        meal_type: meal.meal_type,
        ingredients: item.ingredients.map((ingredient) => ({ ...ingredient, ingredient_id: ingredient.ingredient_id ?? undefined })),
        duration_min: item.duration_min,
        tags: item.tags,
        nutrition: { calories: item.calories ?? 0 },
        cookware_required: item.cookware_required,
      };
      const failure = plannerHardConstraintFailure(recipe, input);
      if (failure) return failure;
    }
  }
  return null;
}
