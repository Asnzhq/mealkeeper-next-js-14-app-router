import { expect, test } from "@playwright/test";

const password = "MealKeeper-family-e2e-2026";
async function registerAndLogin(page: import("@playwright/test").Page, name: string, email: string) {
  const registered = await page.request.post("/api/account", { data: { name, email, password } });
  expect(registered.ok()).toBeTruthy();
  await page.goto("/login");
  await page.getByLabel("邮箱地址").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).first().click();
  await expect(page).toHaveURL(/\/family$/);
}

test("家庭成员完成用餐后另一账号在轮询周期内同步库存与最后操作人", async ({ browser }) => {
  const stamp = Date.now();
  const ownerName = `家庭成员甲${stamp}`;
  const ownerEmail = `owner-${stamp}@mealkeeper.test`;
  const secondName = `家庭成员乙${stamp}`;
  const secondEmail = `member-${stamp}@mealkeeper.test`;
  const owner = await browser.newPage();
  const second = await browser.newPage();
  await registerAndLogin(owner, ownerName, ownerEmail);
  await owner.getByLabel("家庭名称").fill(`分享家庭${stamp}`);
  await owner.getByRole("button", { name: "创建家庭", exact: true }).click();
  const invite = await owner.locator("code").innerText();

  await registerAndLogin(second, secondName, secondEmail);
  await second.getByLabel("家庭邀请码").fill(invite);
  await second.getByRole("button", { name: "加入家庭", exact: true }).click();
  await expect(second.getByText("家庭成员乙", { exact: false })).toBeVisible();

  const ingredientResponse = await owner.request.post("/api/ingredients", { data: { name: `共享番茄${stamp}`, category: "蔬菜", unit: "g", stock_qty: 1000, safety_stock: 100, storage: "fridge", expiry_date: null, cost_per_unit: 0.02, tags: [] } });
  expect(ingredientResponse.ok()).toBeTruthy();
  const ingredient = (await ingredientResponse.json()).data as { id: string };
  const recipeResponse = await owner.request.post("/api/recipes", { data: { name: `家庭炖菜${stamp}`, meal_type: "dinner", ingredients: [{ ingredient_id: ingredient.id, name: `共享番茄${stamp}`, quantity: 250, unit: "g", role: "main" }], steps: ["清洗番茄。", "放入锅中炖煮。", "调味后装盘。"], duration_min: 20, tags: ["荤菜"], nutrition: { calories: 200 }, image_url: "https://example.test/meal.jpg" } });
  expect(recipeResponse.ok()).toBeTruthy();
  const recipe = (await recipeResponse.json()).data as { id: string };
  const planResponse = await owner.request.post("/api/plans", { data: { date: new Date().toISOString(), meal_type: "dinner", recipe_id: recipe.id, servings: 1, status: "planned" } });
  expect(planResponse.ok()).toBeTruthy();
  const plan = (await planResponse.json()).data as { id: string };

  await second.goto("/ingredients");
  await expect(second.getByText("1000", { exact: true })).toBeVisible();
  const finish = await owner.request.post(`/api/plans/${plan.id}/finish`, { data: {} });
  expect(finish.ok()).toBeTruthy();
  await expect(second.getByText("750", { exact: true })).toBeVisible({ timeout: 8_000 });
  await expect(second.getByText(`最后操作：${ownerName}`, { exact: true })).toBeVisible();
});
