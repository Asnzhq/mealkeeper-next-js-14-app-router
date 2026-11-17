import { convertQuantity } from "@/lib/quantities";

export interface ShoppingStock {
  id: string;
  name: string;
  unit: string;
  stock_qty: number;
}
export interface PlannedRecipeItem {
  ingredient_id?: string | null;
  name: string;
  quantity: number;
  unit?: string;
}
export interface FutureMenuPlan {
  servings: number;
  ingredients: PlannedRecipeItem[];
}
export interface ShoppingGap {
  ingredient_id: string | null;
  name: string;
  quantity: number;
  unit: string;
}

export function calculateShoppingGaps(stock: ShoppingStock[], plans: FutureMenuPlan[]): ShoppingGap[] {
  const grouped = new Map<string, { ingredient_id: string | null; name: string; unit: string; requested: number; stock: number }>();
  for (const plan of plans) {
    for (const item of plan.ingredients) {
      const ingredient = stock.find((row) => item.ingredient_id ? row.id === item.ingredient_id : row.name.trim().toLocaleLowerCase() === item.name.trim().toLocaleLowerCase());
      const itemUnit = item.unit ?? ingredient?.unit;
      if (!itemUnit) continue;
      const key = ingredient?.id ?? item.name.trim().toLocaleLowerCase();
      const existing = grouped.get(key);
      const unit = existing?.unit ?? ingredient?.unit ?? itemUnit;
      const amount = convertQuantity(item.quantity * plan.servings, itemUnit, unit);
      if (existing) existing.requested += amount;
      else grouped.set(key, { ingredient_id: ingredient?.id ?? null, name: ingredient?.name ?? item.name, unit, requested: amount, stock: ingredient?.stock_qty ?? 0 });
    }
  }
  return [...grouped.values()].flatMap((item) => {
    const quantity = Math.max(0, item.requested - item.stock);
    if (quantity <= 1e-9) return [];
    const digits = ["g", "ml", "个", "只"].includes(item.unit) ? 0 : 2;
    const scale = 10 ** digits;
    return [{ ingredient_id: item.ingredient_id, name: item.name, unit: item.unit, quantity: Math.round((quantity + Number.EPSILON) * scale) / scale }];
  });
}
