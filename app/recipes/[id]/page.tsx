import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { RecipeDetail, type RecipeDetailData } from "@/components/recipes/recipe-detail";
import { prisma } from "@/server/db";
import { zhCN } from "@/lib/i18n/zh-CN";
import type { RecipeIngredient } from "@/lib/planner/types";

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function normalizeIngredients(value: unknown): RecipeIngredient[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const item = recordOf(entry);
    if (!item || typeof item.name !== "string" || typeof item.quantity !== "number") return [];
    return [{ ingredient_id: typeof item.ingredient_id === "string" ? item.ingredient_id : undefined, name: item.name, quantity: item.quantity, unit: typeof item.unit === "string" ? item.unit : "g", role: item.role === "main" || item.role === "seasoning" ? item.role : "side" }];
  });
}
function normalizeSteps(value: unknown): RecipeDetailData["steps"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (typeof entry === "string") return [{ title: `${zhCN.stepLabel} ${index + 1}`, instruction: entry }];
    const item = recordOf(entry);
    if (!item) return [];
    const instruction = typeof item.instruction === "string" ? item.instruction : typeof item.description === "string" ? item.description : "";
    if (!instruction) return [];
    return [{ title: typeof item.title === "string" ? item.title : `${zhCN.stepLabel} ${index + 1}`, instruction, image_url: typeof item.image_url === "string" ? item.image_url : undefined }];
  });
}

export default async function RecipePage({ params }: { params: { id: string } }) {
  const row = await prisma.recipe.findUnique({ where: { id: params.id } });
  if (!row || row.review_status !== "approved") notFound();
  const nutrition = recordOf(row.nutrition);
  const data: RecipeDetailData = {
    id: row.id, name: row.name, meal_type: row.meal_type === "breakfast" || row.meal_type === "lunch" ? row.meal_type : "dinner",
    ingredients: normalizeIngredients(row.ingredients), steps: normalizeSteps(row.steps), duration_min: row.duration_min,
    tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string") : [],
    nutrition: typeof nutrition?.calories === "number" ? { calories: nutrition.calories } : undefined,
    image_url: row.image_url, source: row.source, review_status: row.review_status,
  };
  return <AppShell><RecipeDetail recipe={data} /></AppShell>;
}
