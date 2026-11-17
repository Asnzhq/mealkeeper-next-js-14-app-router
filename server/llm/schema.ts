import { z } from "zod";

const IngredientSchema = z.object({
  ingredient_id: z.string().max(100).nullable().optional(),
  name: z.string().trim().min(1).max(80),
  quantity: z.number().positive().max(100000),
  unit: z.enum(["g", "kg", "斤", "两", "ml", "L", "个", "只", "勺"]),
  role: z.enum(["main", "side", "seasoning"]).default("side"),
}).strict();

const StepSchema = z.object({
  title: z.string().trim().min(1).max(80),
  instruction: z.string().trim().min(1).max(500),
}).strict();

export const MealsSchema = z.object({
  meals: z.array(z.object({
    meal_type: z.enum(["breakfast", "lunch", "dinner"]),
    recipes: z.array(z.object({
      recipe_id: z.string().max(100).nullable().optional(),
      name: z.string().trim().min(1).max(80),
      ingredients: z.array(IngredientSchema).min(1).max(30),
      steps: z.array(StepSchema).min(3).max(12),
      duration_min: z.number().int().min(1).max(360),
      tags: z.array(z.string().trim().min(1).max(24)).max(12).default([]),
      calories: z.number().nonnegative().max(5000),
      cookware_required: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
    }).strict()).min(1).max(6),
  }).strict()).min(1).max(21),
}).strict();

export type MealsOutput = z.infer<typeof MealsSchema>;

// OpenAI-compatible function calling constrains the model output before Zod validation.
export const mealsTool = {
  type: "function" as const,
  function: {
    name: "submit_meal_plan",
    description: "Return a structured meal plan with complete recipe steps.",
    strict: true,
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["meals"],
      properties: {
        meals: { type: "array", minItems: 1, maxItems: 21, items: {
          type: "object", additionalProperties: false, required: ["meal_type", "recipes"],
          properties: {
            meal_type: { type: "string", enum: ["breakfast", "lunch", "dinner"] },
            recipes: { type: "array", minItems: 1, maxItems: 6, items: {
              type: "object", additionalProperties: false,
              required: ["recipe_id", "name", "ingredients", "steps", "duration_min", "tags", "calories", "cookware_required"],
              properties: {
                recipe_id: { type: ["string", "null"] }, name: { type: "string" },
                ingredients: { type: "array", minItems: 1, maxItems: 30, items: {
                  type: "object", additionalProperties: false, required: ["ingredient_id", "name", "quantity", "unit", "role"],
                  properties: { ingredient_id: { type: ["string", "null"] }, name: { type: "string" }, quantity: { type: "number" }, unit: { type: "string", enum: ["g", "kg", "斤", "两", "ml", "L", "个", "只", "勺"] }, role: { type: "string", enum: ["main", "side", "seasoning"] } },
                } },
                steps: { type: "array", minItems: 3, maxItems: 12, items: { type: "object", additionalProperties: false, required: ["title", "instruction"], properties: { title: { type: "string" }, instruction: { type: "string" } } } },
                duration_min: { type: "integer" }, tags: { type: "array", items: { type: "string" } }, calories: { type: ["number", "null"] }, cookware_required: { type: "array", items: { type: "string" } },
              },
            } },
          },
        } },
      },
    },
  },
};
