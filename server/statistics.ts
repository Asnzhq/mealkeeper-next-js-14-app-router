import { prisma } from "@/server/db";
import { convertQuantity, quantityInGrams } from "@/lib/quantities";

type RecipeIngredient = { ingredient_id?: string | null; name?: string; quantity: number; unit?: string };
type Nutrition = { calories?: number; kcal?: number; protein?: number; protein_g?: number; carbs?: number; carbohydrates?: number; carbs_g?: number; fat?: number; fat_g?: number };
const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const startOfDay = (date: Date) => { const value = new Date(date); value.setHours(0, 0, 0, 0); return value; };
const numeric = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;

export async function getStatistics(days: 7 | 30, now = new Date(), familyId?: string | null) {
  const start = startOfDay(now); start.setDate(start.getDate() - days + 1);
  const [ingredients, plans, logs] = await Promise.all([
    prisma.ingredient.findMany({ where: familyId !== undefined ? { family_id: familyId } : {} }),
    prisma.plan.findMany({ where: { status: "finished", finished_at: { gte: start, lte: now }, ...(familyId !== undefined ? { family_id: familyId } : {}) }, include: { recipe: true }, orderBy: { finished_at: "asc" } }),
    prisma.inventoryLog.findMany({ where: { delta: { lt: 0 }, reason: { startsWith: "plan:finish:" }, created_at: { gte: start, lte: now }, ...(familyId !== undefined ? { ingredient: { family_id: familyId } } : {}) }, include: { ingredient: true } }),
  ]);
  const costs = new Map<string, Record<string, number>>();
  const daily = new Map<string, { date: string; breakfast: number; lunch: number; dinner: number; total: number }>();
  const popularity = new Map<string, { recipe_id: string; name: string; count: number }>();
  const nutritionDaily = new Map<string, { date: string; calories: number; protein: number; carbs: number; fat: number }>();

  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(start); day.setDate(day.getDate() + offset); const key = dayKey(day);
    daily.set(key, { date: key, breakfast: 0, lunch: 0, dinner: 0, total: 0 });
    nutritionDaily.set(key, { date: key, calories: 0, protein: 0, carbs: 0, fat: 0 });
  }
  for (const plan of plans) {
    if (!plan.recipe || !plan.finished_at) continue;
    const date = dayKey(plan.finished_at);
    const parts = Array.isArray(plan.recipe.ingredients) ? plan.recipe.ingredients as RecipeIngredient[] : [];
    let cost = 0;
    for (const part of parts) {
      const ingredient = ingredients.find((item) => part.ingredient_id ? item.id === part.ingredient_id : item.name.trim().toLocaleLowerCase() === part.name?.trim().toLocaleLowerCase());
      if (!ingredient) continue;
      const amount = convertQuantity(part.quantity * plan.servings, part.unit ?? ingredient.unit, ingredient.unit);
      cost += amount * ingredient.cost_per_unit;
    }
    const row = daily.get(date);
    if (row && plan.meal_type in row) { row[plan.meal_type as "breakfast" | "lunch" | "dinner"] += cost; row.total += cost; }
    const hot = popularity.get(plan.recipe.id) ?? { recipe_id: plan.recipe.id, name: plan.recipe.name, count: 0 };
    hot.count += 1; popularity.set(plan.recipe.id, hot);
    const n = (plan.recipe.nutrition && typeof plan.recipe.nutrition === "object" ? plan.recipe.nutrition : {}) as Nutrition;
    const nRow = nutritionDaily.get(date);
    if (nRow) {
      nRow.calories += numeric(n.calories ?? n.kcal) * plan.servings;
      nRow.protein += numeric(n.protein ?? n.protein_g) * plan.servings;
      nRow.carbs += numeric(n.carbs ?? n.carbohydrates ?? n.carbs_g) * plan.servings;
      nRow.fat += numeric(n.fat ?? n.fat_g) * plan.servings;
    }
  }
  const consumed = new Map<string, { ingredient_id: string; name: string; unit: string; quantity: number; cost: number }>();
  for (const log of logs) {
    const value = consumed.get(log.ingredient_id) ?? { ingredient_id: log.ingredient_id, name: log.ingredient.name, unit: log.ingredient.unit, quantity: 0, cost: 0 };
    value.quantity += Math.abs(log.delta); value.cost += Math.abs(log.delta) * log.ingredient.cost_per_unit; consumed.set(log.ingredient_id, value);
  }
  const weekStart = startOfDay(now); weekStart.setDate(weekStart.getDate() - 6);
  const weekPlans = plans.filter((plan) => plan.finished_at && plan.finished_at >= weekStart);
  const diversity = new Set<string>();
  for (const plan of weekPlans) {
    const parts = plan.recipe && Array.isArray(plan.recipe.ingredients) ? plan.recipe.ingredients as RecipeIngredient[] : [];
    for (const part of parts) diversity.add(part.ingredient_id ?? part.name?.trim().toLocaleLowerCase() ?? "");
  }
  return {
    days, empty: plans.length === 0,
    meal_cost_trend: [...daily.values()].map((item) => Object.fromEntries(Object.entries(item).map(([key, value]) => [key, typeof value === "number" ? Math.round(value * 100) / 100 : value]))),
    consumption_top: [...consumed.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 10),
    recipe_popularity: [...popularity.values()].sort((a, b) => b.count - a.count).slice(0, 10),
    nutrition_trend: [...nutritionDaily.values()],
    diversity: { ingredients: diversity.size, target: 30, score: Math.min(100, Math.round(diversity.size / 30 * 100)) },
  };
}

export async function getWasteStatistics(monthCount = 6, now = new Date(), familyId?: string | null) {
  const months = Math.min(12, Math.max(1, monthCount));
  const first = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  const logs = await prisma.inventoryLog.findMany({ where: { reason: "waste", delta: { lt: 0 }, created_at: { gte: first, lte: now }, ...(familyId !== undefined ? { ingredient: { family_id: familyId } } : {}) }, include: { ingredient: true } });
  const values = new Map<string, { month: string; amount: number; weight_g: number }>();
  for (let index = 0; index < months; index += 1) {
    const monthDate = new Date(first.getFullYear(), first.getMonth() + index, 1);
    const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
    values.set(key, { month: key, amount: 0, weight_g: 0 });
  }
  for (const log of logs) {
    const key = `${log.created_at.getFullYear()}-${String(log.created_at.getMonth() + 1).padStart(2, "0")}`;
    const value = values.get(key); if (!value) continue;
    const quantity = Math.abs(log.delta);
    value.amount += quantity * log.ingredient.cost_per_unit;
    value.weight_g += quantityInGrams(quantity, log.ingredient.unit) ?? 0;
  }
  return [...values.values()].map((item) => ({ ...item, amount: Math.round(item.amount * 100) / 100, weight_g: Math.round(item.weight_g * 100) / 100 }));
}
