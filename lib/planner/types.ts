export type MealType = "breakfast" | "lunch" | "dinner";
export type DishType = "meat" | "vegetable" | "staple" | "other";
export type StorageUnit = string;

export interface RecipeIngredient {
  ingredient_id?: string;
  name: string;
  quantity: number;
  unit: StorageUnit;
  role?: "main" | "side" | "seasoning";
}
export interface PlannerRecipe {
  id: string;
  name: string;
  meal_type: MealType;
  ingredients: RecipeIngredient[];
  steps?: string[];
  duration_min: number;
  tags: string[];
  nutrition?: { calories?: number } | null;
  image_url?: string;
  cookware_required?: string[];
  servings?: number;
}
export interface InventoryStock {
  ingredient_id?: string;
  name: string;
  quantity: number;
  unit: StorageUnit;
  expiring?: boolean;
  expiry_date?: string | Date | null;
  cost_per_unit?: number;
}
export interface UserPreferences {
  avoid?: string[];
  allergies?: string[];
  tastes?: string[];
  calorieTarget?: number;
  vegetarian?: boolean;
  maxCookingMinutes?: number;
  availableCookware?: string[];
  budget?: number;
}
export interface ShoppingGap {
  ingredient_id?: string;
  name: string;
  quantity: number;
  unit: StorageUnit;
}
export type RelaxedConstraint = "calorie_range" | "cooking_duration" | "recent_recipe_dedup" | "inventory_satisfaction" | "meal_composition";
export interface Shortage extends ShoppingGap {
  meal_type: MealType;
  recipe_id: string;
  recipe_name: string;
}
export interface ScaledRecipe extends PlannerRecipe {
  scaled_ingredients: RecipeIngredient[];
  scaled_calories: number;
}
export interface Plan {
  id: string;
  date: string;
  meal_type: MealType;
  recipe_id: string;
  servings: number;
  status: "planned" | "finished" | "skipped";
  planned_at: string;
  recipe: ScaledRecipe;
  shoppingGaps: ShoppingGap[];
  feasibility: number;
  recommendationReasons: string[];
}
export interface GenerateMealsInput {
  recipes: PlannerRecipe[];
  inventory: InventoryStock[];
  preferences?: UserPreferences;
  targetDate: string | Date;
  mealTypes?: MealType[];
  servings?: number;
  recentRecipeIds?: string[];
  requiredComposition?: Partial<Record<MealType, DishType[]>>;
  inventorySatisfactionThreshold?: number;
  /** Deterministic pass-through metadata; it does not affect candidate scoring. */
  seed?: number;
}
export interface GenerateMealsResult {
  meals: Plan[];
  shortages: Shortage[];
  relaxed: RelaxedConstraint[];
  failureReason: string | null;
  seed: number;
}
