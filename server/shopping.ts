import { Prisma } from "@prisma/client";
import { convertQuantity } from "@/lib/quantities";
import { calculateShoppingGaps, type PlannedRecipeItem } from "@/lib/shopping";
import { applyInventoryChange } from "@/server/inventory";
import { prisma } from "@/server/db";

const AUTO_NOTE = "auto:menu-gap";
type PlanRecipe = { servings: number; recipe: { ingredients: unknown } | null };

export async function recomputeShoppingItems(now = new Date(), familyId?: string | null) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 3);
  const [stock, plans] = await Promise.all([
    prisma.ingredient.findMany({ where: familyId !== undefined ? { family_id: familyId } : {} }),
    prisma.plan.findMany({ where: { status: "planned", date: { gte: start, lt: end }, ...(familyId !== undefined ? { family_id: familyId } : {}) }, include: { recipe: true } }),
  ]);
  const normalizedPlans = (plans as PlanRecipe[]).flatMap((plan) => {
    if (!plan.recipe || !Array.isArray(plan.recipe.ingredients)) return [];
    const ingredients = (plan.recipe.ingredients as PlannedRecipeItem[]).filter((item) => typeof item.name === "string" && Number.isFinite(item.quantity) && item.quantity > 0);
    return [{ servings: plan.servings, ingredients }];
  });
  const gaps = calculateShoppingGaps(stock, normalizedPlans);
  return prisma.$transaction(async (tx) => {
    const autoItems = await tx.shoppingItem.findMany({ where: { note: AUTO_NOTE, ...(familyId !== undefined ? { family_id: familyId } : {}) } });
    for (const item of autoItems) {
      const next = gaps.find((gap) => gap.ingredient_id ? gap.ingredient_id === item.ingredient_id : gap.name.trim().toLocaleLowerCase() === item.name.trim().toLocaleLowerCase());
      if (!next && !item.checked) await tx.shoppingItem.delete({ where: { id: item.id } });
    }
    for (const gap of gaps) {
      const open = autoItems.find((item) => !item.checked && (gap.ingredient_id ? item.ingredient_id === gap.ingredient_id : item.name.trim().toLocaleLowerCase() === gap.name.trim().toLocaleLowerCase()));
      if (open) await tx.shoppingItem.update({ where: { id: open.id }, data: { name: gap.name, quantity: gap.quantity, unit: gap.unit, ingredient_id: gap.ingredient_id } });
      else await tx.shoppingItem.create({ data: { name: gap.name, quantity: gap.quantity, unit: gap.unit, ingredient_id: gap.ingredient_id, family_id: familyId ?? null, checked: false, note: AUTO_NOTE } });
    }
    return tx.shoppingItem.findMany({ where: familyId !== undefined ? { family_id: familyId } : {}, include: { ingredient: true }, orderBy: [{ checked: "asc" }, { created_at: "desc" }] });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function receiveShoppingItem(itemId: string, operatorId?: string, familyId?: string | null) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.shoppingItem.findFirst({ where: { id: itemId, ...(familyId !== undefined ? { family_id: familyId } : {}) } });
    if (!item) throw new Error("购物项不存在");
    if (!item.checked) throw new Error("请先确认已采购，再执行入库");
    const ingredientScope = familyId !== undefined ? { family_id: familyId } : {};
    const ingredient = item.ingredient_id
      ? await tx.ingredient.findFirst({ where: { id: item.ingredient_id, ...ingredientScope } })
      : await tx.ingredient.findFirst({ where: { name: { equals: item.name }, ...ingredientScope } });
    if (!ingredient) throw new Error("请先将此购物项关联到库存食材");
    const amount = convertQuantity(item.quantity, item.unit ?? ingredient.unit, ingredient.unit);
    const result = await applyInventoryChange(tx, ingredient.id, amount, "shopping:stock-in", null, operatorId, `shopping:${item.id}:stock-in`);
    await tx.shoppingItem.delete({ where: { id: item.id } });
    return { ingredient: result.ingredient, log: result.log };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
