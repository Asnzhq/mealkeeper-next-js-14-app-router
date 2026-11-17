import { expect, test } from "@playwright/test";

test("硬约束无解时今日页显示具体原因和三个恢复操作", async ({ page }) => {
  const recipeName = "无食材午餐候选";
  await page.route("**/api/recipes**", async (route) => {
    const url = new URL(route.request().url());
    if (url.search) return route.continue();
    await route.fulfill({ json: { code: 200, message: "ok", data: [{
      id: "invalid-lunch-recipe", name: recipeName, meal_type: "lunch", ingredients: [], steps: [], duration_min: 8, tags: [], nutrition: {}, image_url: "",
    }] } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "重新生成今日" }).first().click();
  const failure = page.getByTestId("planner-failure");
  await expect(failure).toContainText(recipeName);
  await expect(page.getByRole("button", { name: "放宽条件重试" })).toBeVisible();
  await expect(page.getByRole("link", { name: "去补充食材" })).toBeVisible();
  await page.getByRole("button", { name: "手动选菜" }).click();
  await expect(page.getByRole("dialog", { name: "换一道" })).toBeVisible();
});
