import { describe, expect, it } from "vitest";
import { ingredientSchema, recipeSchema } from "@/server/schemas";
import { recipeWriteData, serializeRecipe } from "@/server/recipe-record";

describe("ingredientSchema", () => {
  it("接受任意 1 到 30 字符名称、自定义分类和常见中式单位", () => {
    const parsed = ingredientSchema.safeParse({ name: " 西兰花 ", category: "家庭自定义", unit: "条", stock_qty: 300 });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toMatchObject({ name: "西兰花", category: "家庭自定义", unit: "条", stock_qty: 300 });
  });

  it("允许自定义单位但拒绝空单位与超过 30 字符的名称", () => {
    const validCustomUnit = ingredientSchema.safeParse({ name: "老豆腐", category: "豆制品", unit: "盒装", stock_qty: 1 });
    const invalidName = ingredientSchema.safeParse({ name: "长".repeat(31), category: "其他", unit: "盒" });
    const invalidUnit = ingredientSchema.safeParse({ name: "鲈鱼", category: "海鲜", unit: "   " });

    expect(validCustomUnit.success).toBe(true);
    expect(invalidName.success).toBe(false);
    expect(invalidUnit.success).toBe(false);
  });
});

describe("recipe cover contract", () => {
  const draft = { name: "新菜", meal_type: "dinner", ingredients: [], steps: ["准备", "烹饪", "装盘"], duration_min: 20 };

  it("allows omitted covers without overwriting existing covers on partial updates", () => {
    expect(recipeWriteData(recipeSchema.parse(draft)).imageUrl).toBeUndefined();
    expect(recipeWriteData(recipeSchema.partial().parse({ name: "改名" })).imageUrl).toBeUndefined();
  });

  it("accepts the old and new fields and supports clearing the cover", () => {
    expect(recipeWriteData(recipeSchema.parse({ ...draft, image_url: "/recipes/a.webp" })).imageUrl).toBe("/recipes/a.webp");
    expect(recipeWriteData(recipeSchema.parse({ ...draft, imageUrl: "https://example.test/cover.png" })).imageUrl).toBe("https://example.test/cover.png");
    expect(recipeWriteData(recipeSchema.parse({ ...draft, image_url: "" })).imageUrl).toBeNull();
    expect(recipeWriteData(recipeSchema.parse({ ...draft, imageUrl: null })).imageUrl).toBeNull();
    expect(recipeSchema.safeParse({ ...draft, imageUrl: "//example.test/cover.png" }).success).toBe(false);
    expect(serializeRecipe({ imageUrl: null })).toEqual({ imageUrl: null, image_url: "" });
    expect(serializeRecipe({ imageUrl: "" })).toEqual({ imageUrl: null, image_url: "" });
  });
});
