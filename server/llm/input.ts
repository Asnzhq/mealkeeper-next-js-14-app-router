import { z } from "zod";

const ingredient = z.object({ ingredient_id: z.string().max(100).nullable().optional().transform((value) => value ?? undefined), name: z.string().trim().min(1).max(80), quantity: z.number().finite().nonnegative(), unit: z.string().min(1).max(12), role: z.enum(["main", "side", "seasoning"]).optional() }).strict();
const recipe = z.object({ id: z.string().max(100), name: z.string().trim().min(1).max(100), meal_type: z.enum(["breakfast", "lunch", "dinner"]), ingredients: z.array(ingredient).max(30), steps: z.array(z.string().max(500)).max(20).optional(), duration_min: z.number().int().nonnegative().max(360), tags: z.array(z.string().max(30)).max(20), nutrition: z.object({ calories: z.number().nonnegative().max(10000).optional() }).nullable().optional(), image_url: z.string().max(500).optional(), cookware_required: z.array(z.string().max(30)).max(10).optional(), servings: z.number().int().positive().max(20).optional() }).strict();
const dishType = z.enum(["meat", "vegetable", "staple", "other"]);

export const PlannerInputSchema = z.object({
  recipes: z.array(recipe).max(200),
  inventory: z.array(z.object({ ingredient_id: z.string().max(100).nullable().optional().transform((value) => value ?? undefined), name: z.string().trim().min(1).max(80), quantity: z.number().finite().nonnegative(), unit: z.string().min(1).max(12), expiring: z.boolean().optional(), expiry_date: z.union([z.string().max(30), z.date()]).nullable().optional() }).strict()).max(300),
  preferences: z.object({ avoid: z.array(z.string().max(50)).max(24).optional(), allergies: z.array(z.string().max(50)).max(24).optional(), tastes: z.array(z.string().max(50)).max(24).optional(), calorieTarget: z.number().positive().max(5000).optional(), vegetarian: z.boolean().optional(), maxCookingMinutes: z.number().positive().max(360).optional(), availableCookware: z.array(z.string().max(30)).max(20).optional(), budget: z.number().nonnegative().max(100000).optional() }).strict().optional(),
  requiredComposition: z.object({ breakfast: z.array(dishType).optional(), lunch: z.array(dishType).optional(), dinner: z.array(dishType).optional() }).strict().optional(),
  targetDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.date()]),
  mealTypes: z.array(z.enum(["breakfast", "lunch", "dinner"])).min(1).max(3).optional(), servings: z.number().int().positive().max(20).optional(), recentRecipeIds: z.array(z.string().max(100)).max(100).optional(),
}).strict();
