import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { completePlans, InventoryShortageError, undoPlanCompletion } from "@/server/plan-completion";

const created = { ingredients: [] as string[], recipes: [] as string[], plans: [] as string[] };
async function fixture(stock = 500, used = 200) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ingredient = await prisma.ingredient.create({ data: { name: `事务测试食材-${suffix}`, category: "测试", unit: "g", stock_qty: stock } });
  created.ingredients.push(ingredient.id);
  const recipe = await prisma.recipe.create({ data: { name: `事务测试菜-${suffix}`, meal_type: "dinner", ingredients: [{ ingredient_id: ingredient.id, name: ingredient.name, quantity: used / 2, unit: "g" }], steps: ["准备", "烹饪", "完成"], duration_min: 20, tags: [], imageUrl: "https://example.test/placeholder.svg" } });
  created.recipes.push(recipe.id);
  const plan = await prisma.plan.create({ data: { date: new Date(), meal_type: "dinner", recipe_id: recipe.id, servings: 2 } });
  created.plans.push(plan.id);
  return { ingredient, plan, recipe, originalStock: stock, expectedUse: used };
}

afterEach(async () => {
  if (created.plans.length) await prisma.inventoryLog.deleteMany({ where: { ref_plan_id: { in: created.plans } } });
  if (created.plans.length) await prisma.shoppingItem.deleteMany({ where: { note: { in: created.plans.map((id) => `plan-debt:${id}`) } } });
  if (created.plans.length) await prisma.plan.deleteMany({ where: { id: { in: created.plans } } });
  if (created.recipes.length) await prisma.recipe.deleteMany({ where: { id: { in: created.recipes } } });
  if (created.ingredients.length) await prisma.ingredient.deleteMany({ where: { id: { in: created.ingredients } } });
  created.ingredients = []; created.recipes = []; created.plans = [];
});

describe("做好菜后原子扣库存", () => {
  it("并发重复提交同一计划只扣一次", async () => {
    const { ingredient, plan, originalStock, expectedUse } = await fixture();
    const results = await Promise.allSettled([completePlans([{ plan_id: plan.id }]), completePlans([{ plan_id: plan.id }])]);
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    const updated = await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } });
    const logs = await prisma.inventoryLog.findMany({ where: { ref_plan_id: plan.id, reason: `plan:finish:${plan.id}` } });
    expect(updated.stock_qty).toBe(originalStock - expectedUse);
    expect(logs).toHaveLength(1);
    expect(logs[0].delta).toBe(-expectedUse);
    expect((await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } })).status).toBe("finished");
  });

  it("撤销完成后恢复库存原值并回到计划中", async () => {
    const { ingredient, plan, originalStock, expectedUse } = await fixture();
    await completePlans([{ plan_id: plan.id }]);
    expect((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).stock_qty).toBe(originalStock - expectedUse);
    await undoPlanCompletion(plan.id);
    expect((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).stock_qty).toBe(originalStock);
    expect((await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } })).status).toBe("planned");
    const reverse = await prisma.inventoryLog.findMany({ where: { ref_plan_id: plan.id, reason: `plan:undo:${plan.id}` } });
    expect(reverse).toHaveLength(1);
    expect(reverse[0].delta).toBe(expectedUse);
  });

  it("同一个计划撤销后可重新完成，并发重打卡只扣一次且仍可撤销", async () => {
    const { ingredient, plan, originalStock, expectedUse } = await fixture();
    const selection = [{ plan_id: plan.id }];
    await completePlans(selection);
    await undoPlanCompletion(plan.id);

    await Promise.all([completePlans(selection), completePlans(selection)]);
    expect((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).stock_qty)
      .toBe(originalStock - expectedUse);
    const logs = await prisma.inventoryLog.findMany({ where: { ref_plan_id: plan.id, reason: `plan:finish:${plan.id}` } });
    expect(logs.map(({ delta }) => delta)).toEqual([-expectedUse, -expectedUse]);
    expect(new Set(logs.map(({ idempotency_key }) => idempotency_key)).size).toBe(2);

    await undoPlanCompletion(plan.id);
    expect((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).stock_qty).toBe(originalStock);
    expect((await prisma.plan.findUniqueOrThrow({ where: { id: plan.id } })).status).toBe("planned");
  });

  it("超过24小时先要求二次确认，欠账撤销后库存与欠账均冲回", async () => {
    const { ingredient, plan, originalStock, expectedUse } = await fixture(40, 200);
    await completePlans([{ plan_id: plan.id }], { allow_debt: true, add_shortages_to_shopping: true });
    await prisma.plan.update({ where: { id: plan.id }, data: { finished_at: new Date(Date.now() - 25 * 60 * 60 * 1000) } });
    const firstUndo = await undoPlanCompletion(plan.id);
    expect(firstUndo.needs_confirmation).toBe(true);
    expect((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).stock_qty).toBe(0);
    await undoPlanCompletion(plan.id, true);
    expect((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).stock_qty).toBe(originalStock);
    const reversal = await prisma.inventoryLog.findFirstOrThrow({ where: { ref_plan_id: plan.id, reason: `plan:undo:${plan.id}` } });
    expect(reversal.delta).toBe(expectedUse);
    expect(reversal.debt_qty).toBe(-expectedUse + originalStock);
  });

  it("库存不足时默认整笔回滚，显式欠账完成不产生负库存", async () => {
    const { ingredient, plan } = await fixture(40, 200);
    await expect(completePlans([{ plan_id: plan.id }])).rejects.toBeInstanceOf(InventoryShortageError);
    expect((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).stock_qty).toBe(40);
    const result = await completePlans([{ plan_id: plan.id }], { allow_debt: true, add_shortages_to_shopping: true });
    expect((await prisma.ingredient.findUniqueOrThrow({ where: { id: ingredient.id } })).stock_qty).toBe(0);
    const log = await prisma.inventoryLog.findFirstOrThrow({ where: { ref_plan_id: plan.id, reason: `plan:finish:${plan.id}` } });
    expect(log.delta).toBe(-200);
    expect(log.debt_qty).toBe(160);
    expect(result.shortages[0].quantity).toBe(160);
  });
});
