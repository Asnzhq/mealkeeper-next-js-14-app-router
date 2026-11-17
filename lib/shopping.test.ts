import { describe, expect, it } from "vitest";
import { calculateShoppingGaps } from "@/lib/shopping";

describe("future menu shopping gaps", () => {
  it("aggregates demand across meals and normalizes units before subtracting stock", () => {
    const gaps = calculateShoppingGaps([{ id: "pork", name: "五花肉", unit: "g", stock_qty: 500 }], [
      { servings: 1, ingredients: [{ ingredient_id: "pork", name: "五花肉", quantity: 400, unit: "g" }] },
      { servings: 1, ingredients: [{ ingredient_id: "pork", name: "五花肉", quantity: 0.5, unit: "斤" }] },
    ]);
    expect(gaps).toEqual([{ ingredient_id: "pork", name: "五花肉", quantity: 150, unit: "g" }]);
  });

  it("uses planned servings and returns no gap when existing stock covers demand", () => {
    const gaps = calculateShoppingGaps([{ id: "milk", name: "牛奶", unit: "L", stock_qty: 2 }], [
      { servings: 2, ingredients: [{ ingredient_id: "milk", name: "牛奶", quantity: 400, unit: "ml" }] },
    ]);
    expect(gaps).toEqual([]);
  });

  it("rejects comparisons across incompatible dimensions", () => {
    expect(() => calculateShoppingGaps([{ id: "rice", name: "大米", unit: "g", stock_qty: 100 }], [
      { servings: 1, ingredients: [{ ingredient_id: "rice", name: "大米", quantity: 1, unit: "L" }] },
    ])).toThrow("不同量纲不能换算");
  });
});
