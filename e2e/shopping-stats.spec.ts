import { expect, test } from "@playwright/test";

interface Envelope<T> { code: number; data: T; message: string }

test("未来三天菜单缺口会在库存变化后自动重算", async ({ page, request }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const ingredientResponse = await request.post("/api/ingredients", { data: { name: `端测米-${suffix}`, category: "主食", unit: "g", stock_qty: 200, safety_stock: 0, cost_per_unit: 1, tags: [] } });
  expect(ingredientResponse.ok()).toBeTruthy();
  const ingredient = (await ingredientResponse.json() as Envelope<{ id: string }>).data;
  const recipeResponse = await request.post("/api/recipes", { data: { name: `端测米饭-${suffix}`, meal_type: "breakfast", ingredients: [{ ingredient_id: ingredient.id, name: `端测米-${suffix}`, quantity: 0.5, unit: "kg" }], steps: ["淘米", "加水", "煮熟"], duration_min: 30, tags: [], nutrition: { calories: 700 }, image_url: "https://example.test/rice.svg" } });
  expect(recipeResponse.ok()).toBeTruthy();
  const recipe = (await recipeResponse.json() as Envelope<{ id: string }>).data;
  const date = new Date(); date.setDate(date.getDate() + 1); date.setHours(12, 0, 0, 0);
  const planResponse = await request.post("/api/plans", { data: { date: date.toISOString(), meal_type: "breakfast", recipe_id: recipe.id, servings: 2 } });
  expect(planResponse.ok()).toBeTruthy();
  const plan = (await planResponse.json() as Envelope<{ id: string }>).data;
  try {
    await page.goto("/shopping");
    await expect(page.getByText(`端测米-${suffix}`, { exact: true }).first()).toBeVisible();
    await expect(page.getByText("800", { exact: true }).first()).toBeVisible();
    const restock = await request.post(`/api/ingredients/${ingredient.id}/restock`, { data: { delta: 300, reason: "e2e-restock" } });
    expect(restock.ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByText("500", { exact: true }).first()).toBeVisible();
    const restockAgain = await request.post(`/api/ingredients/${ingredient.id}/restock`, { data: { delta: 1000, reason: "e2e-restock" } });
    expect(restockAgain.ok()).toBeTruthy();
    await page.reload();
    await expect(page.getByText("未来三天菜单暂时没有食材缺口")).toBeVisible();
  } finally {
    await request.delete(`/api/plans/${plan.id}`);
    await request.delete(`/api/recipes/${recipe.id}`);
    await request.delete(`/api/ingredients/${ingredient.id}`);
  }
});

test("统计页在没有用餐数据时提供今日菜单引导", async ({ page }) => {
  await page.route("**/api/stats?days=**", async (route) => route.fulfill({ json: { code: 0, data: { days: 7, empty: true, meal_cost_trend: [], consumption_top: [], recipe_popularity: [], nutrition_trend: [], diversity: { ingredients: 0, target: 30, score: 0 }, low_stock: [], expiring: [] }, message: "" } }));
  await page.goto("/stats");
  await expect(page.getByRole("heading", { name: "还没有饮食数据" })).toBeVisible();
  await expect(page.getByRole("link", { name: "去安排今日菜单" })).toHaveAttribute("href", "/");
});
