import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { createPlan, generateMeals } from "@/lib/planner/generate-meals";
import type { GenerateMealsInput, GenerateMealsResult, PlannerRecipe } from "@/lib/planner/types";
import { generateWithFallback } from "@/server/llm/planner";
import { PlannerInputSchema } from "@/server/llm/input";
import { validateAiMeals } from "@/server/llm/validate";
import type { MealsOutput } from "@/server/llm/schema";
import { currentUser } from "@/server/session";
import { zhCN } from "@/lib/i18n/zh-CN";

export const runtime = "nodejs";
const ok = (data: unknown, message = "") => NextResponse.json({ code: 0, data, message });
const fail = (message: string, code = 400) => NextResponse.json({ code, data: null, message }, { status: code });
const placeholder = "";

function viewRecipe(source: PlannerRecipe, input: GenerateMealsInput, mealType: PlannerRecipe["meal_type"], stepDetails?: MealsOutput["meals"][number]["recipes"][number]["steps"], sourceType = "builtin", reviewStatus = "approved") {
  const plan = createPlan(source, input, mealType);
  return { ...plan, recipe: { ...plan.recipe, image_url: source.image_url ?? placeholder, source: sourceType, review_status: reviewStatus, step_details: stepDetails ?? (source.steps ?? []).map((instruction, index) => ({ title: `第 ${index + 1} 步`, instruction })) } };
}

async function persistAiRecipe(item: MealsOutput["meals"][number]["recipes"][number], mealType: PlannerRecipe["meal_type"], input: GenerateMealsInput, familyId: string | null) {
  const matched = input.recipes.find((recipe) => (item.recipe_id && recipe.id === item.recipe_id) || recipe.name.trim() === item.name.trim());
  if (matched) return { recipe: matched, pending: null as null | { id: string; name: string; steps: typeof item.steps; review_status: string; image_url: string } };
  const existing = await prisma.recipe.findFirst({ where: { name: item.name, family_id: familyId, source: "ai", review_status: { not: "rejected" } }, orderBy: { created_at: "desc" } });
  const recipe = existing ?? await prisma.recipe.create({ data: {
    name: item.name, meal_type: mealType, family_id: familyId,
    ingredients: item.ingredients.map((ingredient) => {
      const stock = input.inventory.find((entry) => entry.name.trim() === ingredient.name.trim());
      return { ...ingredient, ingredient_id: ingredient.ingredient_id ?? stock?.ingredient_id ?? null };
    }),
    steps: item.steps, duration_min: item.duration_min, tags: item.tags, nutrition: { calories: item.calories ?? null }, image_url: placeholder, source: "ai", review_status: "pending",
  } });
  const plannerRecipe: PlannerRecipe = {
    id: recipe.id, name: recipe.name, meal_type: mealType,
    ingredients: item.ingredients.map((ingredient) => ({ ...ingredient, ingredient_id: ingredient.ingredient_id ?? input.inventory.find((entry) => entry.name.trim() === ingredient.name.trim())?.ingredient_id })),
    steps: item.steps.map((step) => step.instruction), duration_min: item.duration_min, tags: item.tags,
    nutrition: { calories: item.calories ?? undefined }, image_url: recipe.image_url, cookware_required: item.cookware_required,
  };
  return { recipe: plannerRecipe, pending: { id: recipe.id, name: recipe.name, steps: item.steps, review_status: recipe.review_status, image_url: recipe.image_url } };
}

export async function POST(request: Request) {
  let usageLogged = false;
  try {
    const actor = await currentUser();
    if (request.headers.get("cookie")?.split(";").some((part) => part.trim() === "mealkeeper-local-mode=1") || (actor && (await prisma.user.findUnique({ where: { id: actor.id }, select: { local_mode: true } }))?.local_mode)) return fail("纯本地模式已关闭 AI 排餐，请关闭纯本地模式后再使用。", 403);
    if (process.env.NODE_ENV === "production" && (!actor || !actor.family_id)) return fail("请先登录并完成家庭设置", 401);
    const parsed = PlannerInputSchema.safeParse(await request.json());
    if (!parsed.success) return fail("排餐参数格式不正确", 422);
    const input = parsed.data as GenerateMealsInput;
    const result = await generateWithFallback(input);
    const logUsage = async () => {
      if (usageLogged) return;
      usageLogged = true;
      await prisma.aiUsage.create({ data: { model: result.usage.model, prompt_tokens: result.usage.promptTokens, completion_tokens: result.usage.completionTokens, duration_ms: result.usage.durationMs, status: result.usage.status } });
    };
    if (result.fallback || !result.meals) {
      await logUsage();
      const local = result.fallbackPlans ?? generateMeals(input);
      return ok({ ...local, pendingRecipes: [], fallback: true }, result.message || zhCN.usedLocalPlan);
    }
    const validationMessage = validateAiMeals(result.meals, input);
    if (validationMessage) {
      result.usage.status = "failure";
      await logUsage();
      const local = generateMeals(input);
      return ok({ ...local, pendingRecipes: [], fallback: true }, zhCN.usedLocalPlan);
    }
    const plans = [];
    const pendingRecipes = [];
    await logUsage();
  for (const meal of result.meals.meals) {
      for (const item of meal.recipes) {
        const saved = await persistAiRecipe(item, meal.meal_type, input, actor?.family_id ?? null);
        plans.push(viewRecipe(saved.recipe, input, meal.meal_type, item.steps, saved.pending ? "ai" : "builtin", saved.pending?.review_status ?? "approved"));
        if (saved.pending) pendingRecipes.push(saved.pending);
      }
    }
    await logUsage();
    const generated: GenerateMealsResult = { meals: plans, shortages: plans.flatMap((plan) => plan.shoppingGaps.map((gap) => ({ ...gap, meal_type: plan.meal_type, recipe_id: plan.recipe_id, recipe_name: plan.recipe.name }))), relaxed: [], failureReason: null, seed: input.seed ?? 0 };
    return ok({ ...generated, pendingRecipes, fallback: false }, zhCN.planReady);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "排餐请求失败", 500);
  }
}
