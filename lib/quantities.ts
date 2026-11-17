import { UNIT_BASE } from "@/lib/units";

export function convertQuantity(quantity: number, fromUnit: string, toUnit: string): number {
  const from = UNIT_BASE[fromUnit];
  const to = UNIT_BASE[toUnit];
  if (!from || !to) throw new Error(`不支持的单位: ${!from ? fromUnit : toUnit}`);
  if (from.dimension !== to.dimension) throw new Error("不同量纲不能换算");
  return quantity * from.factor / to.factor;
}

export function quantityInGrams(quantity: number, unit: string): number | null {
  const spec = UNIT_BASE[unit];
  if (!spec || spec.dimension !== "mass") return null;
  return quantity * spec.factor;
}
