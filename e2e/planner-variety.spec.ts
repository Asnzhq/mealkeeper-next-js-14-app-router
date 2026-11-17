import { expect, test } from "@playwright/test";
import type { GenerateMealsInput } from "../lib/planner/types";

test("同一库存连续生成五次，今日页回传历史并排除已经展示过的换菜候选", async ({ page }) => {
  await page.goto("/");
  const breakfast = page.getByRole("article").filter({ has: page.getByText("早餐", { exact: true }) });
  const shown: string[] = [];
  let inventory: GenerateMealsInput["inventory"] | undefined;
  for (let run = 0; run < 5; run++) {
    const generation = page.waitForResponse((response) => response.url().endsWith("/api/planner/generate") && response.request().method() === "POST");
    await page.getByRole("button", { name: "重新生成今日", exact: true }).first().click();
    const response = await generation;
    expect(response.ok()).toBe(true);
    const input = response.request().postDataJSON() as GenerateMealsInput;
    expect(input.seed).toBeUndefined();
    inventory ??= input.inventory;
    expect(input.inventory).toEqual(inventory);
    for (const name of shown) expect(input.excludeFingerprints).toContain(JSON.stringify([name]));

    const title = breakfast.getByRole("heading", { level: 3 });
    await expect(title).toBeVisible();
    const name = await title.innerText();
    expect(shown).not.toContain(name);
    shown.push(name);
    await expect(breakfast.getByText("为什么推荐：", { exact: false })).toBeVisible();
  }
  expect(new Set(shown).size).toBeGreaterThanOrEqual(4);

  const daysDishes = await page.getByRole("article").getByRole("heading", { level: 3 }).allTextContents();
  await breakfast.getByRole("button", { name: "换一道", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "换一道" });
  await expect(dialog).toBeVisible();
  const options = dialog.getByRole("button").filter({ hasText: "为什么推荐" });
  expect(await options.count()).toBeGreaterThan(0);
  for (const name of new Set([...shown, ...daysDishes])) {
    await expect(dialog.getByText(name, { exact: true })).toHaveCount(0);
  }
  const replacement = await options.first().locator("span").first().textContent();
  const saved = page.waitForResponse((response) => /\/api\/plans\/[^/]+$/.test(new URL(response.url()).pathname) && response.request().method() === "PATCH");
  await options.first().click();
  expect((await saved).ok()).toBe(true);
  await expect(breakfast.getByRole("heading", { level: 3 })).toHaveText(replacement!);
});
