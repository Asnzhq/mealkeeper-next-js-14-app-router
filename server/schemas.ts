import { z } from "zod";

export const ingredientSchema = z.object({
  name: z.string().trim().min(1).max(30), category: z.string().trim().min(1).max(30), unit: z.string().trim().min(1).max(20),
  stock_qty: z.number().finite().nonnegative().default(0), safety_stock: z.number().finite().nonnegative().default(0),
  storage: z.string().nullable().optional(), expiry_date: z.coerce.date().nullable().optional(),
  cost_per_unit: z.number().finite().nonnegative().default(0), tags: z.array(z.string()).default([]), family_id: z.string().nullable().optional(),
});
export const recipeSchema = z.object({ name: z.string().min(1), meal_type: z.string().min(1), ingredients: z.array(z.object({ ingredient_id: z.string().min(1), name: z.string().trim().min(1).optional(), role: z.enum(["main", "side", "seasoning"]).optional(), quantity: z.number().positive(), unit: z.enum(["g", "kg", "斤", "两", "ml", "L", "个", "只", "勺"]).optional() })), steps: z.array(z.string().min(1)).min(3), duration_min: z.number().int().positive(), tags: z.array(z.string()).default([]), nutrition: z.unknown().optional(), image_url: z.string().url(), family_id: z.string().nullable().optional() });
export const planSchema = z.object({ date: z.coerce.date(), meal_type: z.string().min(1), recipe_id: z.string().nullable().optional(), servings: z.number().int().positive().default(1), status: z.enum(["planned", "finished", "skipped"]).default("planned"), family_id: z.string().nullable().optional() });
export const shoppingSchema = z.object({ name: z.string().min(1), quantity: z.number().positive().default(1), unit: z.string().optional(), checked: z.boolean().default(false), note: z.string().optional(), ingredient_id: z.string().nullable().optional(), family_id: z.string().nullable().optional(), user_id: z.string().nullable().optional() });
export const changeSchema = z.object({ delta: z.number().finite().refine((v) => v !== 0), reason: z.string().min(1), ref_plan_id: z.string().nullable().optional(), operator_id: z.string().nullable().optional() });

