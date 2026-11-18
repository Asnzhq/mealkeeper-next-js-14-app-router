import { expect, test, type APIRequestContext } from "@playwright/test";
import { rm } from "node:fs/promises";
import path from "node:path";

async function createRecipe(request: APIRequestContext, name: string, image_url = "") {
  const response = await request.post("/api/recipes", { data: {
    name, meal_type: "dinner", ingredients: [], steps: ["准备食材", "加热烹饪", "装盘享用"], duration_min: 20, tags: ["家常"], image_url,
  } });
  expect(response.ok()).toBe(true);
  const result = await response.json() as { data: { id: string; image_url: string } };
  return result.data;
}

test("新菜谱无封面显示占位图，上传后刷新仍显示本地封面", async ({ page, request }) => {
  const name = `E2E封面菜-${Date.now()}`;
  const recipe = await createRecipe(request, name);
  let uploadedUrl = "";
  const externalRequests: string[] = [];
  page.on("request", (requestEvent) => { if (new URL(requestEvent.url()).hostname === "placehold.co") externalRequests.push(requestEvent.url()); });
  try {
    await page.goto("/recipes");
    await expect(page.getByRole("img", { name: `${name}，示意图` })).toBeVisible();
    await page.locator(`a[href="/recipes/${recipe.id}"]`).click();
    await expect(page.getByRole("img", { name: `${name}，示意图` }).first()).toBeVisible();

    await page.getByLabel("上传封面").setInputFiles({
      name: "cover.png",
      mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64"),
    });
    await expect(page.getByRole("status")).toContainText("封面已更新");
    const coverImage = page.getByRole("img", { name, exact: true });
    await expect(coverImage).toHaveAttribute("src", /\/uploads\/recipes\//);
    uploadedUrl = (await coverImage.getAttribute("src")) ?? "";
    await expect.poll(() => coverImage.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const persisted = await request.get(`/api/recipes/${recipe.id}`);
    const persistedData = await persisted.json() as { data: Array<{ image_url: string }> };
    expect(persistedData.data[0]?.image_url).toMatch(/^\/uploads\/recipes\//);
    expect(new URL(uploadedUrl, page.url()).pathname).toBe(persistedData.data[0]?.image_url);
    await page.reload();
    await expect(coverImage).toHaveAttribute("src", uploadedUrl);
    await expect.poll(() => coverImage.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    expect(externalRequests).toEqual([]);
  } finally {
    await request.delete(`/api/recipes/${recipe.id}`);
    if (uploadedUrl) {
      const relative = decodeURIComponent(new URL(uploadedUrl, page.url()).pathname).replace(/^\//, "");
      const target = path.resolve(process.cwd(), "public", relative);
      if (target.startsWith(path.resolve(process.cwd(), "public", "uploads") + path.sep)) await rm(target, { force: true });
    }
  }
});

test("本地封面文件缺失时卡片自动切换为占位图", async ({ page, request }) => {
  const name = `E2E缺图菜-${Date.now()}`;
  const recipe = await createRecipe(request, name, `/recipes/deleted-${Date.now()}.webp`);
  try {
    const missingImage = page.waitForRequest((request) =>
      request.resourceType() === "image" && new URL(request.url()).pathname === recipe.image_url
    );
    await page.goto(`/recipes/${recipe.id}`);
    await missingImage;
    await expect(page.getByRole("img", { name: `${name}，示意图` }).first()).toBeVisible();
  } finally {
    await request.delete(`/api/recipes/${recipe.id}`);
  }
});

test("扩充后的 52 道内置菜谱显示占位，且没有失败的图片请求", async ({ page, request }) => {
  const apiResponse = await request.get("/api/recipes");
  const recipes = await apiResponse.json() as { data: Array<{ id: string; name: string; meal_type: string; image_url: string }> };
  const builtins = recipes.data.filter((recipe) => recipe.id.startsWith("seed-recipe-"));
  expect(builtins).toHaveLength(52);
  for (const [type, minimum] of [["breakfast", 12], ["lunch", 20], ["dinner", 20]] as const) {
    expect(builtins.filter((recipe) => recipe.meal_type === type).length).toBeGreaterThanOrEqual(minimum);
  }
  expect(builtins.every((recipe) => recipe.image_url === "")).toBe(true);

  const placeholderRequests: string[] = [];
  const failedImages: string[] = [];
  page.on("request", (requestEvent) => { if (new URL(requestEvent.url()).hostname === "placehold.co") placeholderRequests.push(requestEvent.url()); });
  page.on("response", (response) => {
    if (response.request().resourceType() === "image" && response.status() >= 400) failedImages.push(response.url());
  });
  await page.goto("/recipes");
  for (const recipe of builtins) {
    const card = page.locator(`a[href="/recipes/${recipe.id}"]`);
    await expect(card.getByRole("img", { name: `${recipe.name}，示意图` })).toBeVisible();
  }
  for (const id of ["seed-recipe-31", "seed-recipe-41", "seed-recipe-47"]) {
    const recipe = builtins.find((item) => item.id === id)!;
    await page.goto(`/recipes/${id}`);
    await expect(page.getByRole("img", { name: `${recipe.name}，示意图` }).first()).toBeVisible();
  }
  expect(placeholderRequests).toEqual([]);
  expect(failedImages).toEqual([]);
});
