import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/session", () => ({ currentUser: async () => null }));

import { POST } from "@/app/api/[...segments]/route";
import { prisma } from "@/server/db";

async function postIngredient(data: Record<string, unknown>) {
  return POST(new Request("http://localhost/api/ingredients", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }));
}
async function postBatch(data: Array<Record<string, unknown>>) {
  return POST(new Request("http://localhost/api/ingredients/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }));
}

describe("ingredient duplicate merge API", () => {
  beforeEach(async () => {
    await prisma.inventoryLog.deleteMany();
    await prisma.ingredient.deleteMany();
  });

  it("merges a duplicate quantity through a positive inventory log", async () => {
    const originalResponse = await postIngredient({ name: "老豆腐", category: "豆制品", unit: "盒", stock_qty: 2 });
    const originalPayload = await originalResponse.json();
    const existingId = originalPayload.data.id as string;

    const mergedResponse = await postIngredient({
      name: "老豆腐", category: "豆制品", unit: "盒", stock_qty: 3,
      duplicate_action: "merge", duplicate_ingredient_id: existingId,
    });
    const mergedPayload = await mergedResponse.json();
    const rows = await prisma.ingredient.findMany({ where: { name: "老豆腐" } });
    const logs = await prisma.inventoryLog.findMany({ where: { ingredient_id: existingId } });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.stock_qty).toBe(5);
    expect(mergedPayload).toMatchObject({ code: 0, data: { id: existingId, stock_qty: 5 } });
    expect(logs.some((log) => log.delta === 3 && log.reason === "duplicate:merge")).toBe(true);
  });

  it("routes /ingredients/batch to batch creation and accepts Chinese units", async () => {
    const response = await postBatch([
      { name: "鲈鱼", category: "海鲜", unit: "条", stock_qty: 1 },
      { name: "老豆腐", category: "豆制品", unit: "盒", stock_qty: 2 },
    ]);
    const payload = await response.json();
    const rows = await prisma.ingredient.findMany({ where: { name: { in: ["鲈鱼", "老豆腐"] } }, orderBy: { name: "asc" } });

    expect(payload).toMatchObject({ code: 0, data: expect.any(Array) });
    expect(rows.map((row) => [row.name, row.stock_qty, row.unit])).toEqual([["老豆腐", 2, "盒"], ["鲈鱼", 1, "条"]]);
  });
});
