import type { PlannerRecipe, RecipeIngredient, ScaledRecipe } from "@/lib/planner/types";

function precision(unit: string): number {
  if (["g", "ml", "个", "只"].includes(unit)) return 0;
  if (["勺"].includes(unit)) return 1;
  return 2;
}
function roundQuantity(value: number, unit: string): number {
  const digits=precision(unit);const factor=10**digits;return Math.round((value+Number.EPSILON)*factor)/factor;
}

export function scaleRecipe(recipe: PlannerRecipe, servings: number): ScaledRecipe {
  const safeServings=Number.isFinite(servings)&&servings>0?servings:1;
  const baseServings=recipe.servings&&recipe.servings>0?recipe.servings:1;
  const ratio=safeServings/baseServings;
  const scaled_ingredients:RecipeIngredient[]=recipe.ingredients.map(item=>({...item,quantity:roundQuantity(item.quantity*ratio,item.unit)}));
  return {...recipe,servings:safeServings,scaled_ingredients,scaled_calories:roundQuantity((recipe.nutrition?.calories??0)*ratio,"kcal")};
}
