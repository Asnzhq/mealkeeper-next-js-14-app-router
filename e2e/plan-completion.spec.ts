import { expect, test } from "@playwright/test";

interface Envelope<T> { code: number; data: T; message: string }

test("生成菜单、打卡扣库存、撤销后库存复原", async ({ page, request }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const ingredientResponse = await request.post("/api/ingredients", { data: { name: `端测鸡蛋-${suffix}`, category: "蛋奶", unit: "个", stock_qty: 8, safety_stock: 1, storage: "冷藏", cost_per_unit: 1, tags: [] } });
  expect(ingredientResponse.ok()).toBeTruthy();
  const ingredient = (await ingredientResponse.json() as Envelope<{ id: string; name: string; stock_qty: number; unit: string }>).data;
  const recipeResponse = await request.post("/api/recipes", { data: { name: `端测早餐-${suffix}`, meal_type: "breakfast", ingredients: [{ ingredient_id: ingredient.id, name: ingredient.name, role: "main", quantity: 1, unit: "个" }], steps: ["准备食材", "煎熟鸡蛋", "装盘上桌"], duration_min: 10, tags: ["早餐"], nutrition: { calories: 700 }, image_url: "https://example.test/breakfast.svg" } });
  expect(recipeResponse.ok()).toBeTruthy();
  const recipe = (await recipeResponse.json() as Envelope<{ id: string; name: string; ingredients: unknown[] }>).data;
  let planId = "";

  await page.route("**/api/recipes**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const url = new URL(route.request().url());
    const data = url.searchParams.get("source") === "ai" ? [] : [recipe];
    await route.fulfill({ json: { code: 0, data, message: "" } });
  });
  await page.route("**/api/ingredients**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({ json: { code: 0, data: [ingredient], message: "" } });
  });
  await page.route("**/api/plans?date=**", async (route) => route.fulfill({ json: { code: 0, data: [], message: "" } }));
  await page.route("**/api/ai-usage", async (route) => route.fulfill({ json: { code: 0, data: { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, averageDurationMs: 0, estimatedCost: 0, currency: "USD", windowDays: 30 }, message: "" } }));

  try {
    page.on("pageerror", (error) => console.error("e2e page error:", error.message));
    page.on("requestfailed", (request) => console.error("e2e request failed:", request.method(), request.url(), request.failure()?.errorText));
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "今天吃得好一点" })).toBeVisible();
    const persistPlan = page.waitForResponse((response) => response.request().method() === "POST" && new URL(response.url()).pathname === "/api/plans");
    await page.getByRole("button", { name: "重新生成今日" }).first().click();
    const persisted = await persistPlan;
    planId = (await persisted.json() as Envelope<{ id: string }>).data.id;
    await expect(page.getByRole("heading", { name: recipe.name })).toBeVisible();
    await page.getByRole("button", { name: "做好了" }).first().click();
    await expect(page.getByRole("dialog", { name: /端测早餐/ })).toBeVisible();
    await page.getByRole("button", { name: "确认完成并扣库存" }).click();
    await expect(page.getByText("已打卡，库存已更新")).toBeVisible();
    const afterFinish = await request.get(`/api/ingredients/${ingredient.id}`);
    const afterFinishRows = (await afterFinish.json() as Envelope<Array<{ stock_qty: number }>>).data;
    expect(afterFinishRows[0]?.stock_qty ?? ingredient.stock_qty).toBeLessThan(ingredient.stock_qty);
    await page.getByRole("button", { name: "撤销完成" }).click();
    await expect(page.getByText("已撤销，库存已复原")).toBeVisible();
    const afterUndo = await request.get(`/api/ingredients/${ingredient.id}`);
    const afterUndoRows = (await afterUndo.json() as Envelope<Array<{ stock_qty: number }>>).data;
    expect(afterUndoRows[0]?.stock_qty ?? ingredient.stock_qty).toBe(ingredient.stock_qty);
  } finally {
    if (planId) await request.delete(`/api/plans/${planId}`);
    await request.delete(`/api/recipes/${recipe.id}`);
    await request.delete(`/api/ingredients/${ingredient.id}`);
  }
});
