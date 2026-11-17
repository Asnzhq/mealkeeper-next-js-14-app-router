import { describe, expect, it } from "vitest";
import type { GenerateMealsInput } from "@/lib/planner/types";
import { validateAiMeals } from "@/server/llm/validate";
import type { MealsOutput } from "@/server/llm/schema";

const steps = [{ title: "准备", instruction: "准备食材。" }, { title: "烹饪", instruction: "煮熟食材。" }, { title: "装盘", instruction: "装盘食用。" }];
const output: MealsOutput = { meals: [{ meal_type: "lunch", recipes: [{ recipe_id: "egg-dish", name: "鸡蛋菜", ingredients: [{ ingredient_id: "egg", name: "鸡蛋", quantity: 2, unit: "个", role: "main" }], steps, duration_min: 45, tags: ["素菜"], calories: 120, cookware_required: ["炒锅"] }] }] };
const input: GenerateMealsInput = { recipes: [], inventory: [{ ingredient_id: "egg", name: "鸡蛋", quantity: 1, unit: "个" }], targetDate: "2026-11-17", mealTypes: ["lunch"], recentRecipeIds: ["egg-dish"], preferences: { avoid: [], allergies: [], calorieTarget: 1200, maxCookingMinutes: 15, vegetarian: true, availableCookware: [] }, requiredComposition: { lunch: ["meat", "vegetable", "staple"] } };

describe("validateAiMeals", () => {
  it("does not reject AI meals for soft constraints that the local planner can relax", () => {
    expect(validateAiMeals(output, input)).toBeNull();
  });
  it("still rejects hard allergy violations", () => {
    expect(validateAiMeals(output, { ...input, preferences: { ...input.preferences, allergies: ["鸡蛋"] } })).toContain("鸡蛋");
  });
});
