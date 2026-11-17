import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { applyInventoryChange } from "@/server/inventory";
import { UNIT_BASE } from "@/lib/units";
import { zhCN } from "@/lib/i18n/zh-CN";

export interface ActualUsage {
  ingredient_id: string;
  quantity: number;
  unit: string;
}
export interface CompletionSelection {
  plan_id: string;
  actual_usage?: ActualUsage[];
}
export interface CompletionOptions {
  allow_debt?: boolean;
  add_shortages_to_shopping?: boolean;
  operator_id?: string;
  family_id?: string | null;
}
export interface Shortage {
  plan_id: string;
  ingredient_id: string;
  name: string;
  quantity: number;
  unit: string;
}
export class InventoryShortageError extends Error {
  constructor(readonly shortages: Shortage[]) {
    super(zhCN.shortageDebtPrompt);
    this.name = "InventoryShortageError";
  }
}

type RecipePart = { ingredient_id?: string | null; name?: string; quantity: number; unit?: string };
const toBase = (quantity: number, unit: string) => {
  const conversion = UNIT_BASE[unit];
  if (!conversion) throw new Error(`不支持的计量单位: ${unit}`);
  return { quantity: quantity * conversion.factor, dimension: conversion.dimension };
};
const convert = (quantity: number, from: string, to: string) => {
  const source = toBase(quantity, from);
  const target = UNIT_BASE[to];
  if (!target || source.dimension !== target.dimension) throw new Error("食谱用量与库存单位无法换算");
  return source.quantity / target.factor;
};

export async function completePlans(selections: CompletionSelection[], options: CompletionOptions = {}) {
  if (!selections.length) throw new Error("请选择要完成的菜品");
  if (new Set(selections.map((item) => item.plan_id)).size !== selections.length) throw new Error("计划不能重复提交");
  try {
    return await prisma.$transaction(async (tx) => {
    const planRows = await tx.plan.findMany({ where: { id: { in: selections.map((item) => item.plan_id) }, ...(options.family_id !== undefined ? { family_id: options.family_id } : {}) }, include: { recipe: true } });
    if (planRows.length !== selections.length || planRows.some((plan) => !plan.recipe)) throw new Error("计划或菜谱不存在");
    const shortages: Shortage[] = [];
    const prepared: Array<{ plan: typeof planRows[number]; usage: Array<{ ingredientId: string; amount: number; unit: string; name: string }> }> = [];

    for (const selection of selections) {
      const plan = planRows.find((item) => item.id === selection.plan_id)!;
      if (plan.status === "finished") { prepared.push({ plan, usage: [] }); continue; }
      if (plan.status !== "planned") throw new Error("只有计划中的菜品可以完成");
      const parts = plan.recipe!.ingredients as unknown as RecipePart[];
      const input = selection.actual_usage;
      const usage = (input?.length ? input : parts.map((part) => ({ ingredient_id: part.ingredient_id ?? "", quantity: part.quantity * plan.servings, unit: part.unit ?? "" })))
        .filter((item) => item.quantity > 0)
        .map((item) => ({ item }));
      const resolved: Array<{ ingredientId: string; amount: number; unit: string; name: string }> = [];
      for (const entry of usage) {
        const part = parts.find((item) => item.ingredient_id === entry.item.ingredient_id);
        const ingredientId = entry.item.ingredient_id || part?.ingredient_id;
        if (!ingredientId) throw new Error("菜谱食材缺少库存关联");
        const ingredient = await tx.ingredient.findFirst({ where: { id: ingredientId, ...(options.family_id !== undefined ? { family_id: options.family_id } : {}) } });
        if (!ingredient) throw new Error(`食材不存在: ${ingredientId}`);
        const recipePart = parts.find((item) => item.ingredient_id === ingredientId || item.name?.trim().toLocaleLowerCase() === ingredient.name.trim().toLocaleLowerCase());
        if (!recipePart) throw new Error("实际用量包含不属于此菜谱的食材");
        const sourceUnit = entry.item.unit || recipePart?.unit || ingredient.unit;
        const amount = convert(entry.item.quantity, sourceUnit, ingredient.unit);
        resolved.push({ ingredientId, amount, unit: ingredient.unit, name: ingredient.name });
      }
      const merged = new Map<string, typeof resolved[number]>();
      for (const item of resolved) {
        const old = merged.get(item.ingredientId);
        if (old) old.amount += item.amount;
        else merged.set(item.ingredientId, { ...item });
      }
      prepared.push({ plan, usage: [...merged.values()] });
    }
    const totalDemand = new Map<string, { amount: number; name: string; unit: string; plan_id: string }>();
    for (const entry of prepared) for (const item of entry.usage) {
      const previous = totalDemand.get(item.ingredientId);
      if (previous) previous.amount += item.amount;
      else totalDemand.set(item.ingredientId, { ...item, plan_id: entry.plan.id });
    }
    for (const [ingredientId, demand] of totalDemand) {
      const ingredient = await tx.ingredient.findUniqueOrThrow({ where: { id: ingredientId } });
      if (demand.amount > ingredient.stock_qty + 1e-9) shortages.push({ plan_id: demand.plan_id, ingredient_id: ingredientId, name: demand.name, quantity: Math.round((demand.amount - ingredient.stock_qty) * 1000) / 1000, unit: demand.unit });
    }
    if (shortages.length && !options.allow_debt) throw new InventoryShortageError(shortages);

    const changed = [];
    for (const entry of prepared) {
      if (entry.plan.status !== "finished") {
        const claim = await tx.plan.updateMany({ where: { id: entry.plan.id, status: "planned" }, data: { status: "finished", finished_at: new Date() } });
        if (claim.count !== 1) throw new Error("计划状态已变化，请刷新后重试");
        for (const item of entry.usage) {
          const ingredient = await tx.ingredient.findUniqueOrThrow({ where: { id: item.ingredientId } });
          const physicalUse = Math.min(item.amount, ingredient.stock_qty);
          const debt = Math.max(0, item.amount - physicalUse);
          if (physicalUse === 0 && debt === 0) continue;
          const result = await applyInventoryChange(tx, item.ingredientId, -item.amount, `plan:finish:${entry.plan.id}`, entry.plan.id, options.operator_id, `${entry.plan.id}:${item.ingredientId}`, debt);
          changed.push({ plan_id: entry.plan.id, ingredient_id: item.ingredientId, stock_qty: result.ingredient.stock_qty, used: item.amount, debt });
          if (debt > 0 && options.add_shortages_to_shopping) {
            await tx.shoppingItem.create({ data: { ingredient_id: item.ingredientId, family_id: entry.plan.family_id, name: item.name, quantity: debt, unit: item.unit, note: `plan-debt:${entry.plan.id}` } });
          }
        }
      }
    }
    const plans = await tx.plan.findMany({ where: { id: { in: selections.map((item) => item.plan_id) } }, include: { recipe: true } });
    return { plans, inventory: changed, shortages, already_completed: prepared.filter((item) => item.plan.status === "finished").map((item) => item.plan.id) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    const completed = await prisma.plan.findMany({ where: { id: { in: selections.map((item) => item.plan_id) } }, include: { recipe: true } });
    if (completed.length === selections.length && completed.every((plan) => plan.status === "finished")) return { plans: completed, inventory: [], shortages: [], already_completed: completed.map((plan) => plan.id) };
    throw error;
  }
}

export async function undoPlanCompletion(planId: string, confirmOld = false, operatorId?: string) {
  return prisma.$transaction(async (tx) => {
    const plan = await tx.plan.findUnique({ where: { id: planId } });
    if (!plan || plan.status !== "finished" || !plan.finished_at) throw new Error("找不到已完成的计划");
    const age = Date.now() - plan.finished_at.getTime();
    if (age > 24 * 60 * 60 * 1000 && !confirmOld) return { needs_confirmation: true as const, age_hours: Math.floor(age / 3600000) };
    const logs = await tx.inventoryLog.findMany({ where: { ref_plan_id: planId, reason: `plan:finish:${planId}` } });
    for (const original of logs) {
      const key = `undo:${original.idempotency_key ?? original.id}`;
      const exists = await tx.inventoryLog.findUnique({ where: { idempotency_key: key } });
      if (exists) continue;
      await applyInventoryChange(tx, original.ingredient_id, -original.delta, `plan:undo:${planId}`, planId, operatorId, key, -original.debt_qty);
    }
    await tx.shoppingItem.deleteMany({ where: { note: `plan-debt:${planId}` } });
    const update = await tx.plan.updateMany({ where: { id: planId, status: "finished" }, data: { status: "planned", finished_at: null } });
    if (update.count !== 1) throw new Error("计划状态已变化，请刷新后重试");
    return { needs_confirmation: false as const, plan_id: planId, restored: logs.length };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function skipPlans(planIds: string[], familyId?: string | null) {
  if (!planIds.length) throw new Error("请选择要跳过的餐次");
  return prisma.$transaction(async (tx) => {
    const plans = await tx.plan.findMany({ where: { id: { in: planIds }, ...(familyId !== undefined ? { family_id: familyId } : {}) } });
    if (plans.length !== planIds.length || plans.some((plan) => plan.status !== "planned")) throw new Error("只有计划中的餐次可以跳过");
    await tx.plan.updateMany({ where: { id: { in: planIds }, status: "planned" }, data: { status: "skipped" } });
    return tx.plan.findMany({ where: { id: { in: planIds }, ...(familyId !== undefined ? { family_id: familyId } : {}) }, include: { recipe: true } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
