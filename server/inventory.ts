import { prisma } from "@/server/db";
import { Prisma } from "@prisma/client";

export async function applyInventoryChangeInTransaction(tx: Prisma.TransactionClient, ingredientId: string, delta: number, reason: string, refPlanId?: string | null, operatorId?: string | null, idempotencyKey?: string, debtQty = 0, createdAt?: Date) {
  if (!Number.isFinite(delta) || (delta === 0 && debtQty === 0)) throw new Error("库存变化量必须是非零有限数字");
  if (!Number.isFinite(debtQty)) throw new Error("欠账数量无效");
  if ((debtQty > 0 && delta > 0) || (debtQty < 0 && delta < 0)) throw new Error("库存欠账方向无效");
  if (idempotencyKey) {
    const prior = await tx.inventoryLog.findUnique({ where: { idempotency_key: idempotencyKey } });
    if (prior) return { ingredient: await tx.ingredient.findUniqueOrThrow({ where: { id: ingredientId } }), log: prior, duplicate: true };
  }
  const ingredient = await tx.ingredient.findUnique({ where: { id: ingredientId } });
  if (!ingredient) throw new Error("食材不存在");
  const inventoryDelta = delta + debtQty;
  const nextStock = ingredient.stock_qty + inventoryDelta;
  if (nextStock < -1e-9) throw new Error("库存不足，不能扣减");
  const updated = inventoryDelta === 0 ? ingredient : await tx.ingredient.update({ where: { id: ingredientId }, data: { stock_qty: Math.max(0, nextStock) } });
  const log = await tx.inventoryLog.create({ data: { ingredient_id: ingredientId, delta, reason, ref_plan_id: refPlanId ?? null, operator_id: operatorId ?? null, idempotency_key: idempotencyKey ?? null, debt_qty: debtQty, ...(createdAt ? { created_at: createdAt } : {}) } });
  return { ingredient: updated, log, duplicate: false };
}

export function applyInventoryChange(ingredientId: string, delta: number, reason: string, refPlanId?: string | null, operatorId?: string | null, idempotencyKey?: string): ReturnType<typeof applyInventoryChangeInTransaction>;
export function applyInventoryChange(tx: Prisma.TransactionClient, ingredientId: string, delta: number, reason: string, refPlanId?: string | null, operatorId?: string | null, idempotencyKey?: string, debtQty?: number): ReturnType<typeof applyInventoryChangeInTransaction>;
export async function applyInventoryChange(first: string | Prisma.TransactionClient, second: number | string, third: string | number, fourth?: string | null, fifth?: string | null, sixth?: string | null, seventh?: string, eighth?: number) {
  if (typeof first !== "string") return applyInventoryChangeInTransaction(first, second as string, third as number, fourth as string, fifth, sixth, seventh, eighth);
  return prisma.$transaction(tx => applyInventoryChangeInTransaction(tx, first, second as number, third as string, fourth, fifth, sixth ?? undefined), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function undoInventoryChange(logId: string, operatorId?: string | null) {
  return prisma.$transaction(async tx => {
    const original = await tx.inventoryLog.findUnique({ where: { id: logId } });
    if (!original) throw new Error("库存流水不存在");
    const undoReason = `undo:${logId}`;
    const exists = await tx.inventoryLog.findFirst({ where: { reason: undoReason } });
    if (exists) throw new Error("该库存流水已撤销");
    return applyInventoryChange(tx, original.ingredient_id, -original.delta, undoReason, original.ref_plan_id, operatorId, `undo:${original.idempotency_key ?? logId}`, -original.debt_qty);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
