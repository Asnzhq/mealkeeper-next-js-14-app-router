import { prisma } from "@/server/db";
import { applyInventoryChange } from "@/server/inventory";
import { Prisma } from "@prisma/client";

export function getExpiryState(expiryDate: Date, now = new Date()): "expired" | "expiring" | "fresh" {
  const days = Math.floor((Date.UTC(expiryDate.getFullYear(), expiryDate.getMonth(), expiryDate.getDate()) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000);
  if (days <= 0) return "expired";
  if (days <= 3) return "expiring";
  return "fresh";
}

export async function findExpiringIngredients(now = new Date(), familyId?: string | null) {
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const through = new Date(end);
  through.setDate(through.getDate() + 3);
  return prisma.ingredient.findMany({ where: { expiry_date: { lte: through }, ...(familyId !== undefined ? { family_id: familyId } : {}) }, orderBy: { expiry_date: "asc" } });
}

export async function findExpiryGroups(now = new Date(), familyId?: string | null) {
  const ingredients = await prisma.ingredient.findMany({ where: { expiry_date: { not: null }, stock_qty: { gt: 0 }, ...(familyId !== undefined ? { family_id: familyId } : {}) }, orderBy: { expiry_date: "asc" } });
  const buckets = { today: [] as typeof ingredients, tomorrow: [] as typeof ingredients, within_three_days: [] as typeof ingredients, expired: [] as typeof ingredients };
  const utcDay = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  for (const ingredient of ingredients) {
    if (!ingredient.expiry_date) continue;
    const days = Math.floor((utcDay(ingredient.expiry_date) - utcDay(now)) / 86_400_000);
    if (days < 0) buckets.expired.push(ingredient);
    else if (days === 0) buckets.today.push(ingredient);
    else if (days === 1) buckets.tomorrow.push(ingredient);
    else if (days <= 3) buckets.within_three_days.push(ingredient);
  }
  return buckets;
}

export async function recordExpiredWaste(ingredientId: string, operatorId?: string) {
  return prisma.$transaction(async (tx) => {
    const ingredient = await tx.ingredient.findUnique({ where: { id: ingredientId } });
    if (!ingredient || !ingredient.expiry_date) throw new Error("找不到有保质期的食材");
    if (getExpiryState(ingredient.expiry_date) !== "expired") throw new Error("只有已过期食材可以记为损耗");
    if (ingredient.stock_qty <= 0) throw new Error("这份食材没有剩余库存");
    const priorLosses = await tx.inventoryLog.count({ where: { ingredient_id: ingredient.id, reason: "waste" } });
    const key = `waste:${ingredient.id}:${ingredient.expiry_date.toISOString()}:${priorLosses + 1}`;
    return applyInventoryChange(tx, ingredient.id, -ingredient.stock_qty, "waste", null, operatorId, key);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
