export const UNIT_BASE: Readonly<Record<string, { dimension: string; factor: number }>> = {
  g: { dimension: "mass", factor: 1 }, kg: { dimension: "mass", factor: 1000 },
  斤: { dimension: "mass", factor: 500 }, 两: { dimension: "mass", factor: 50 },
  ml: { dimension: "volume", factor: 1 }, L: { dimension: "volume", factor: 1000 },
  个: { dimension: "count", factor: 1 }, 只: { dimension: "count", factor: 1 }, 颗: { dimension: "count", factor: 1 }, 头: { dimension: "count", factor: 1 },
  勺: { dimension: "spoon", factor: 1 },
  条: { dimension: "unit:条", factor: 1 }, 盒: { dimension: "unit:盒", factor: 1 }, 把: { dimension: "unit:把", factor: 1 }, 根: { dimension: "unit:根", factor: 1 }, 棵: { dimension: "unit:棵", factor: 1 }, 块: { dimension: "unit:块", factor: 1 }, 袋: { dimension: "unit:袋", factor: 1 }, 罐: { dimension: "unit:罐", factor: 1 }, 份: { dimension: "unit:份", factor: 1 }, 捆: { dimension: "unit:捆", factor: 1 },
};

export function normalizeQuantity(quantity: number, unit: string): { quantity: number; dimension: string } {
  const conversion = UNIT_BASE[unit];
  if (!conversion) throw new Error(`不支持的单位: ${unit}`);
  return { quantity: quantity * conversion.factor, dimension: conversion.dimension };
}

export function compareQuantities(a: number, unitA: string, b: number, unitB: string): number {
  const left = normalizeQuantity(a, unitA);
  const right = normalizeQuantity(b, unitB);
  if (left.dimension !== right.dimension) throw new Error("不同量纲不能直接比较");
  return left.quantity - right.quantity;
}
