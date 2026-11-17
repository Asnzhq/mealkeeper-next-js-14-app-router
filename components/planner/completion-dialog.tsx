"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { zhCN } from "@/lib/i18n/zh-CN";
import { UNIT_BASE } from "@/lib/units";
import type { Plan } from "@/lib/planner";

interface StockItem { id: string; name: string; stock_qty: number; unit: string }
export interface CompletionSubmission {
  plans: Array<{ plan_id: string; actual_usage: Array<{ ingredient_id: string; quantity: number; unit: string }> }>;
  allow_debt: boolean;
  add_shortages_to_shopping: boolean;
}

export function CompletionDialog({ plans, stock, onClose, onConfirm, busy, shortageMessage }: { plans: Plan[]; stock: StockItem[]; onClose: () => void; onConfirm: (value: CompletionSubmission) => void; busy: boolean; shortageMessage: string }) {
  const initial = useMemo(() => Object.fromEntries(plans.flatMap((plan) => plan.recipe.scaled_ingredients.map((item) => [`${plan.id}:${item.ingredient_id ?? item.name}`, { quantity: item.quantity, unit: item.unit, unused: false, remaining: "" }]))), [plans]);
  const [values, setValues] = useState(initial);
  const [allowDebt, setAllowDebt] = useState(false);
  const [addToShopping, setAddToShopping] = useState(true);
  const [error, setError] = useState("");
  const display = (quantity: number, from: string, to: string) => {
    const source = UNIT_BASE[from]; const target = UNIT_BASE[to];
    if (!source || !target || source.dimension !== target.dimension) return `${quantity} ${from}`;
    const converted = quantity * source.factor / target.factor;
    return `${Number(converted.toFixed(3))} ${to}`;
  };
  const build = (debt: boolean): CompletionSubmission => ({ plans: plans.map((plan) => ({ plan_id: plan.id, actual_usage: plan.recipe.scaled_ingredients.map((item) => {
    const key = `${plan.id}:${item.ingredient_id ?? item.name}`;
    const value = values[key] ?? { quantity: item.quantity, unit: item.unit, unused: false, remaining: "" };
    const ingredient = stock.find((row) => row.id === item.ingredient_id) ?? stock.find((row) => row.name.trim().toLowerCase() === item.name.trim().toLowerCase());
    const remainingValue = value.remaining.trim() ? Number(value.remaining) : null;
    const quantity = value.unused ? 0 : remainingValue !== null && ingredient ? Math.max(0, ingredient.stock_qty - remainingValue) : value.quantity;
    return { ingredient_id: ingredient?.id ?? item.ingredient_id ?? "", quantity, unit: remainingValue !== null && ingredient ? ingredient.unit : value.unit };
  }) })), allow_debt: debt, add_shortages_to_shopping: debt && addToShopping });
  const submit = (debt: boolean) => {
    const payload = build(debt);
    if (payload.plans.some((plan) => plan.actual_usage.some((item) => !item.ingredient_id))) { setError(zhCN.ingredientNotLinked); return; }
    onConfirm(payload);
  };
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="completion-title" className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-background p-5 shadow-soft sm:max-w-2xl sm:rounded-3xl sm:p-6">
      <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-muted-foreground">{zhCN.confirmMealDone}</p><h2 id="completion-title" className="mt-1 text-2xl font-bold">{plans.map((plan) => plan.recipe.name).join("、")}</h2><p className="mt-2 text-sm text-muted-foreground">{zhCN.actualUsage} · {zhCN.leftoverAmount}</p></div><button type="button" aria-label={zhCN.close} onClick={onClose} disabled={busy} className="rounded-full p-2 hover:bg-muted"><X size={20} /></button></div>
      <div className="mt-5 space-y-3">{plans.flatMap((plan) => plan.recipe.scaled_ingredients.map((item) => {
        const key = `${plan.id}:${item.ingredient_id ?? item.name}`;
        const value = values[key] ?? { quantity: item.quantity, unit: item.unit, unused: false, remaining: "" };
        const ingredient = stock.find((row) => row.id === item.ingredient_id) ?? stock.find((row) => row.name.trim().toLowerCase() === item.name.trim().toLowerCase());
        const predicted = value.remaining.trim() && ingredient ? Math.max(0, ingredient.stock_qty - Number(value.remaining)) : value.quantity;
        return <article key={key} className="rounded-2xl border border-border bg-surface p-4"><div className="flex items-center justify-between gap-2"><div><h3 className="font-semibold">{item.name}</h3><p className="mt-1 text-xs text-muted-foreground">{zhCN.plannedUsage} {item.quantity} {item.unit} → {display(item.quantity, item.unit, ingredient?.unit ?? item.unit)} · {zhCN.inventoryCurrent} {ingredient ? `${ingredient.stock_qty} ${ingredient.unit}` : zhCN.notInInventory}</p></div><label className="flex shrink-0 items-center gap-2 text-sm"><input type="checkbox" checked={value.unused} onChange={(event) => setValues((current) => ({ ...current, [key]: { ...value, unused: event.target.checked } }))} className="h-5 w-5 accent-brand" />{zhCN.unusedIngredient}</label></div>
          {!value.unused && <div className="mt-4 grid grid-cols-2 gap-3"><label className="grid gap-1 text-xs font-medium text-muted-foreground">{zhCN.actualUsage}<span className="flex items-center rounded-xl border border-border bg-background px-3"><input aria-label={`${item.name} ${zhCN.actualUsage}`} type="number" min={0} step="any" value={value.quantity} onChange={(event) => setValues((current) => ({ ...current, [key]: { ...value, quantity: Math.max(0, Number(event.target.value)), remaining: "" } }))} className="min-w-0 flex-1 bg-transparent py-2.5 text-base font-semibold text-foreground outline-none" /><span className="text-foreground">{value.unit}</span></span></label><label className="grid gap-1 text-xs font-medium text-muted-foreground">{zhCN.leftoverAmount}<span className="flex items-center rounded-xl border border-border bg-background px-3"><input aria-label={`${item.name} ${zhCN.leftoverAmount}`} type="number" min={0} step="any" placeholder="—" value={value.remaining} onChange={(event) => setValues((current) => ({ ...current, [key]: { ...value, remaining: event.target.value } }))} className="min-w-0 flex-1 bg-transparent py-2.5 text-base font-semibold text-foreground outline-none" /><span className="text-foreground">{ingredient?.unit ?? item.unit}</span></span></label></div>}
          {!value.unused && <p className="mt-2 text-xs text-muted-foreground">{zhCN.remainingAfterUse} {ingredient ? `${Math.max(0, ingredient.stock_qty - (value.remaining.trim() ? Number(predicted) : Number(display(value.quantity, value.unit, ingredient.unit).split(" ")[0]))).toFixed(2)} ${ingredient.unit}` : "—"}</p>}
        </article>;
      }))}</div>
      {shortageMessage && <div role="alert" className="mt-4 rounded-2xl border border-brand/30 bg-brand/10 p-4 text-sm font-medium text-foreground">{shortageMessage}<p className="mt-1 text-xs text-muted-foreground">{zhCN.debtRecorded}</p></div>}
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-brand">{error}</p>}
      {shortageMessage && <label className="mt-4 flex items-center gap-2 rounded-xl bg-muted p-3 text-sm"><input type="checkbox" checked={addToShopping} onChange={(event) => setAddToShopping(event.target.checked)} className="h-5 w-5 accent-brand" />{zhCN.addDebtToShopping}</label>}
      <div className="mt-5 grid gap-2 sm:grid-cols-2"><button type="button" disabled={busy} onClick={() => submit(false)} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 font-semibold text-white disabled:opacity-50"><Check size={18} />{busy ? zhCN.finishingMeal : zhCN.confirmAndDeduct}</button>{shortageMessage && <button type="button" disabled={busy} onClick={() => submit(true)} className="rounded-2xl border border-brand bg-background px-4 py-3 font-semibold text-brand disabled:opacity-50">{zhCN.finishWithDebt}</button>}</div>
      <motion.div aria-label={zhCN.completionProgress} className="sr-only" animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1.2 }} />
    </section>
  </div>;
}
