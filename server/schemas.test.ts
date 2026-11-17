import { describe, expect, it } from "vitest";
import { ingredientSchema } from "@/server/schemas";

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
