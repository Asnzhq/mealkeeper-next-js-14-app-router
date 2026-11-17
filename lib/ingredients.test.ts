import { describe, expect, it } from "vitest";
import { parseIngredientLines } from "@/lib/ingredients";

describe("parseIngredientLines", () => {
  it("解析多行名称、数量和中文单位", () => {
    expect(parseIngredientLines("鸡蛋 6 个\n牛奶 1 L")).toEqual([
      { name: "鸡蛋", quantity: 6, unit: "个" },
      { name: "牛奶", quantity: 1, unit: "L" },
    ]);
  });
  it("忽略空行和格式错误或非正数量", () => {
    expect(parseIngredientLines("\n番茄 4 个\n坏行\n大米 0 kg")).toEqual([{ name: "番茄", quantity: 4, unit: "个" }]);
  });
});
