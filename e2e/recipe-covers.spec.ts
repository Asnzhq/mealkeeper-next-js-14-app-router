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
    await expect(coverImage).toHaveAttribute("src", /_next\/image/);
    uploadedUrl = (await coverImage.getAttribute("src")) ?? "";
    const persisted = await request.get(`/api/recipes/${recipe.id}`);
    const persistedData = await persisted.json() as { data: Array<{ image_url: string }> };
    expect(persistedData.data[0]?.image_url).toMatch(/^\/uploads\/recipes\//);
    await page.reload();
    await expect(page.getByRole("img", { name, exact: true })).toHaveAttribute("src", /_next\/image/);
    expect(externalRequests).toEqual([]);
  } finally {
    await request.delete(`/api/recipes/${recipe.id}`);
    if (uploadedUrl) {
      const imageUrl = new URL(uploadedUrl, "http://localhost");
      const storedPath = imageUrl.searchParams.get("url") ?? imageUrl.pathname;
      const relative = decodeURIComponent(storedPath).replace(/^\//, "");
      const target = path.resolve(process.cwd(), "public", relative);
      if (target.startsWith(path.resolve(process.cwd(), "public", "uploads") + path.sep)) await rm(target, { force: true });
    }
  }
});

test("本地封面文件缺失时卡片自动切换为占位图", async ({ page, request }) => {
  const name = `E2E缺图菜-${Date.now()}`;
  const recipe = await createRecipe(request, name, `/recipes/deleted-${Date.now()}.webp`);
  const failedImages: string[] = [];
  page.on("response", (response) => { if (response.request().resourceType() === "image" && response.status() >= 400) failedImages.push(response.url()); });
  try {
    await page.goto(`/recipes/${recipe.id}`);
    await expect(page.getByRole("img", { name: `${name}，示意图` }).first()).toBeVisible();
    await expect.poll(() => failedImages.some((url) => url.includes("/_next/image?") && url.includes("deleted-"))).toBe(true);
  } finally {
    await request.delete(`/api/recipes/${recipe.id}`);
  }
});

test("30 道内置菜谱列表和详情都使用无远程请求的确定性占位图", async ({ page, request }) => {
  const apiResponse = await request.get("/api/recipes");
  const recipes = await apiResponse.json() as { data: Array<{ id: string; name: string; image_url: string }> };
  const builtins = recipes.data.filter((recipe) => recipe.id.startsWith("seed-recipe-"));
  expect(builtins).toHaveLength(30);
  expect(builtins.every((recipe) => recipe.image_url === "")).toBe(true);

  const placeholderRequests: string[] = [];
  page.on("request", (requestEvent) => { if (new URL(requestEvent.url()).hostname === "placehold.co") placeholderRequests.push(requestEvent.url()); });
  await page.goto("/recipes");
  const placeholders = page.locator('[role="img"][aria-label$="，示意图"]');
  await expect(placeholders).toHaveCount(30);
  await page.locator(`a[href="/recipes/${builtins[0]!.id}"]`).click();
  await expect(page.getByRole("img", { name: `${builtins[0]!.name}，示意图` }).first()).toBeVisible();
  expect(placeholderRequests).toEqual([]);
});
