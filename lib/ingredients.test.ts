import { describe, expect, it } from "vitest";
import { parseIngredientLines } from "@/lib/ingredients";

describe("parseIngredientLines", () => {
  it("解析多行名称、数量和中文单位", () => {
    expect(parseIngredientLines("鸡蛋 6 个\n牛奶 1 L")).toEqual({
      items: [{ name: "鸡蛋", quantity: 6, unit: "个" }, { name: "牛奶", quantity: 1, unit: "L" }],
      errors: [],
    });
  });
  it("忽略空行和格式错误或非正数量", () => {
    expect(parseIngredientLines("\n番茄 4 个\n坏行\n大米 0 kg")).toEqual({
      items: [{ name: "番茄", quantity: 4, unit: "个" }],
      errors: [
        { line: 3, text: "坏行", message: expect.any(String) },
        { line: 4, text: "大米 0 kg", message: expect.any(String) },
      ],
    });
  });

  it("保留中式常用单位，并逐行报告无效输入", () => {
    expect(parseIngredientLines("鲈鱼 1 条\n坏行\n老豆腐 1 盒\n番茄 0 个")).toEqual({
      items: [
        { name: "鲈鱼", quantity: 1, unit: "条" },
        { name: "老豆腐", quantity: 1, unit: "盒" },
      ],
      errors: [
        { line: 2, text: "坏行", message: expect.any(String) },
        { line: 4, text: "番茄 0 个", message: expect.any(String) },
      ],
    });
  });
});
