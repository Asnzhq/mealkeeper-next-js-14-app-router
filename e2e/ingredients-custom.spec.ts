import { expect, test } from "@playwright/test";

async function openIngredientForm(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "添加食材" }).first().click();
  return page.getByRole("dialog", { name: "添加食材" });
}

test("手机视口可录入自定义名称、分类和单位，并可选择重名合并或仍新建", async ({ page, request }) => {
  const suffix = `${Date.now()}`;
  const customName = `老豆腐-${suffix}`;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ingredients");

  let dialog = await openIngredientForm(page);
  await dialog.locator('input[name="name"]').fill(customName);
  await dialog.locator('select[name="category"]').selectOption("其他");
  await dialog.getByRole("textbox", { name: "输入自定义分类" }).fill("豆制品");
  await dialog.locator('input[name="unit"]').fill("盒装");
  await dialog.locator('input[name="stock_qty"]').fill("2");
  await dialog.getByRole("button", { name: "放进冰箱" }).click();
  await expect(page.getByText(customName, { exact: true })).toHaveCount(1);
  const ingredientCard = page.getByRole("button", { name: new RegExp(customName) });
  await expect(ingredientCard.getByText("2", { exact: true })).toBeVisible();
  await expect(ingredientCard.getByText("豆制品", { exact: true })).toBeVisible();

  dialog = await openIngredientForm(page);
  await dialog.locator('input[name="name"]').fill(customName);
  await dialog.locator('select[name="category"]').selectOption("其他");
  await dialog.getByRole("textbox", { name: "输入自定义分类" }).fill("豆制品");
  await dialog.locator('input[name="unit"]').fill("盒装");
  await dialog.locator('input[name="stock_qty"]').fill("3");
  await dialog.getByRole("button", { name: "放进冰箱" }).click();
  const duplicateDialog = page.getByRole("dialog", { name: "已存在同名食材，是否合并数量？" });
  await expect(duplicateDialog).toBeVisible();
  await duplicateDialog.getByRole("button", { name: "合并数量" }).click();
  await expect(page.getByText(customName, { exact: true })).toHaveCount(1);
  await expect(ingredientCard.getByText("5", { exact: true })).toBeVisible();

  dialog = await openIngredientForm(page);
  await dialog.locator('input[name="name"]').fill(customName);
  await dialog.locator('select[name="category"]').selectOption("其他");
  await dialog.getByRole("textbox", { name: "输入自定义分类" }).fill("豆制品");
  await dialog.locator('input[name="unit"]').fill("盒装");
  await dialog.locator('input[name="stock_qty"]').fill("4");
  await dialog.getByRole("button", { name: "放进冰箱" }).click();
  const createDuplicateDialog = page.getByRole("dialog", { name: "已存在同名食材，是否合并数量？" });
  await expect(createDuplicateDialog).toBeVisible();
  await createDuplicateDialog.getByRole("button", { name: "仍新建" }).click();
  await expect(page.getByText(customName, { exact: true })).toHaveCount(2);

  const response = await request.get("/api/ingredients");
  const payload = await response.json() as { data: Array<{ id: string; name: string }> };
  for (const ingredient of payload.data.filter((item) => item.name === customName)) await request.delete(`/api/ingredients/${ingredient.id}`);
});

test("批量解析逐行提示错误后仍可录入自定义单位的有效行", async ({ page, request }) => {
  const suffix = `${Date.now()}`;
  const fishName = `鲈鱼-${suffix}`;
  const tofuName = `老豆腐-${suffix}`;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ingredients");
  await page.getByRole("button", { name: "批量录入" }).first().click();
  const dialog = page.getByRole("dialog", { name: "批量录入" });
  await dialog.locator("textarea").fill(`${fishName} 1 条\n坏行\n${tofuName} 1 盒`);
  await dialog.getByRole("button", { name: "识别食材" }).click();
  await expect(dialog.getByText("2 条有效记录")).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("第 2 行：坏行");
  await dialog.getByRole("button", { name: "添加识别结果" }).click();
  await expect(page.getByRole("button", { name: new RegExp(fishName) })).toContainText("条");
  await expect(page.getByRole("button", { name: new RegExp(tofuName) })).toContainText("盒");
  const response = await request.get("/api/ingredients");
  const payload = await response.json() as { data: Array<{ id: string; name: string }> };
  for (const ingredient of payload.data.filter((item) => item.name === fishName || item.name === tofuName)) await request.delete(`/api/ingredients/${ingredient.id}`);
});

test("服务端单位校验错误绑定到单位字段", async ({ page }) => {
  await page.goto("/ingredients");
  await page.route("**/api/ingredients", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 200, json: { code: 422, data: { fieldErrors: { unit: ["服务端单位校验错误"] } }, message: "参数校验失败" } });
    } else await route.continue();
  });
  const dialog = await openIngredientForm(page);
  await dialog.locator('input[name="name"]').fill(`校验食材-${Date.now()}`);
  await dialog.locator('input[name="unit"]').fill("盒装");
  await dialog.getByRole("button", { name: "放进冰箱" }).click();
  await expect(dialog.getByText("服务端单位校验错误")).toBeVisible();
});
