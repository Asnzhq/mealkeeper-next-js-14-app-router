export const UNIT_BASE: Readonly<Record<string, { dimension: string; factor: number }>> = {
  g: { dimension: "mass", factor: 1 }, kg: { dimension: "mass", factor: 1000 },
  斤: { dimension: "mass", factor: 500 }, 两: { dimension: "mass", factor: 50 },
  ml: { dimension: "volume", factor: 1 }, L: { dimension: "volume", factor: 1000 },
  个: { dimension: "count", factor: 1 }, 只: { dimension: "count", factor: 1 },
  勺: { dimension: "spoon", factor: 1 },
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
