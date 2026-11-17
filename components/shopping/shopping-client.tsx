"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Check, Clipboard, PackageCheck, Plus, ShoppingBasket, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { zhCN } from "@/lib/i18n/zh-CN";

interface ShoppingItem { id: string; name: string; quantity: number; unit: string | null; checked: boolean; note: string | null; ingredient_id: string | null; ingredient?: { id: string; stock_qty: number; unit: string } | null }
interface IngredientOption { id: string; name: string; unit: string }
interface Envelope<T> { code: number; data: T; message: string }
const units = ["g", "kg", "斤", "两", "ml", "L", "个", "只", "勺"] as const;
const addSchema = z.object({ name: z.string().trim().min(1), quantity: z.coerce.number().positive(), unit: z.enum(units), ingredient_id: z.string().optional() });
type AddForm = z.infer<typeof addSchema>;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const payload = await response.json() as Envelope<T>;
  if (!response.ok || payload.code >= 400) throw new Error(payload.message || zhCN.shoppingSaveError);
  return payload.data;
}
async function loadList() {
  await request<ShoppingItem[]>("/api/shopping-items/recompute", { method: "POST", body: "{}" });
  return request<ShoppingItem[]>("/api/shopping-items");
}

export function ShoppingClient() {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ["shopping-items"], queryFn: loadList, refetchOnWindowFocus: true });
  const ingredients = useQuery({ queryKey: ["ingredients"], queryFn: () => request<IngredientOption[]>("/api/ingredients") });
  const [editing, setEditing] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState("");
  const [notice, setNotice] = useState("");
  const form = useForm<AddForm>({ resolver: zodResolver(addSchema), defaultValues: { name: "", quantity: 1, unit: "个", ingredient_id: "" } });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["shopping-items"] });
  const add = useMutation({ mutationFn: (value: AddForm) => request<ShoppingItem>("/api/shopping-items", { method: "POST", body: JSON.stringify({ ...value, ingredient_id: value.ingredient_id || null, checked: false }) }), onSuccess: () => { form.reset({ name: "", quantity: 1, unit: "个", ingredient_id: "" }); setNotice(zhCN.shoppingSaved); void refresh(); }, onError: (error: Error) => setNotice(error.message) });
  const toggle = useMutation({ mutationFn: ({ item, checked }: { item: ShoppingItem; checked: boolean }) => request<ShoppingItem>(`/api/shopping-items/${item.id}`, { method: "PATCH", body: JSON.stringify({ checked }) }), onMutate: async ({ item, checked }) => { await queryClient.cancelQueries({ queryKey: ["shopping-items"] }); const old = queryClient.getQueryData<ShoppingItem[]>(["shopping-items"]) ?? []; queryClient.setQueryData(["shopping-items"], old.map((row) => row.id === item.id ? { ...row, checked } : row)); return { old }; }, onError: (error: Error, _args, context) => { if (context) queryClient.setQueryData(["shopping-items"], context.old); setNotice(error.message); }, onSettled: refresh });
  const saveQuantity = useMutation({ mutationFn: ({ item, quantity }: { item: ShoppingItem; quantity: number }) => request<ShoppingItem>(`/api/shopping-items/${item.id}`, { method: "PATCH", body: JSON.stringify({ quantity }) }), onSuccess: () => { setEditing(null); setNotice(zhCN.shoppingSaved); void refresh(); }, onError: (error: Error) => setNotice(error.message) });
  const stockIn = useMutation({ mutationFn: (item: ShoppingItem) => request(`/api/shopping-items/${item.id}/stock-in`, { method: "POST", body: "{}" }), onSuccess: async () => { setNotice(zhCN.stockInSuccess); await refresh(); await queryClient.invalidateQueries({ queryKey: ["ingredients"] }); await queryClient.invalidateQueries({ queryKey: ["planner", "ingredients"] }); }, onError: (error: Error) => setNotice(error.message) });
  const remove = useMutation({ mutationFn: (id: string) => request(`/api/shopping-items/${id}`, { method: "DELETE" }), onSuccess: refresh, onError: (error: Error) => setNotice(error.message) });
  const clearPurchased = useMutation({ mutationFn: () => request("/api/shopping-items/clear-checked", { method: "DELETE" }), onSuccess: () => { setNotice(zhCN.clearPurchasedDone); void refresh(); } });
  const items = list.data ?? [];
  const open = useMemo(() => items.filter((item) => !item.checked), [items]);
  const autoItems = open.filter((item) => item.note === "auto:menu-gap");
  const copy = async () => {
    const content = [zhCN.shoppingListTextTitle, ...open.map((item) => `□ ${item.name}  ${item.quantity} ${item.unit ?? ""}`)].join("\n");
    try { await navigator.clipboard.writeText(content); setNotice(zhCN.shoppingCopied); } catch { setNotice(zhCN.shoppingCopyFailed); }
  };

  return <AppShell><main id="main-content" className="mx-auto max-w-5xl px-4 pb-32 pt-7 sm:px-8 lg:px-10 lg:pb-12">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="mb-1 text-sm font-medium text-avocado">{zhCN.shopping}</p><h1 className="text-3xl font-bold tracking-tight">{zhCN.shoppingTitle}</h1><p className="mt-2 text-sm text-muted-foreground">{zhCN.shoppingSubtitle}</p></div><div className="flex gap-2"><button type="button" onClick={() => void copy()} disabled={!open.length} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5 text-sm font-semibold disabled:opacity-40"><Clipboard size={16}/>{zhCN.copyShopping}</button><button type="button" onClick={() => { if (window.confirm(zhCN.clearPurchasedConfirm)) clearPurchased.mutate(); }} disabled={!items.some((item) => item.checked)} className="rounded-full px-3 py-2.5 text-sm font-semibold text-muted-foreground disabled:opacity-40">{zhCN.clearPurchased}</button></div></header>
    {notice && <p role="status" className="mb-4 rounded-xl bg-avocado/10 px-4 py-3 text-sm font-medium text-avocado">{notice}</p>}
    <section className="mb-6 rounded-3xl border border-brand/15 bg-brand/5 p-5 shadow-card"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand/10 text-brand"><ShoppingBasket size={20}/></span><div className="min-w-0 flex-1"><h2 className="font-bold">{zhCN.futureThreeDays}</h2><p className="mt-1 text-sm text-muted-foreground">{zhCN.autoShoppingHint}</p>{list.isLoading ? <div className="mt-4 h-12 animate-pulse rounded-xl bg-muted"/> : list.error ? <p role="alert" className="mt-3 text-sm text-danger">{(list.error as Error).message}</p> : autoItems.length ? <ul className="mt-4 grid gap-2 sm:grid-cols-2">{autoItems.map((item) => <li key={item.id} className="flex min-w-0 items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2.5 text-sm"><span className="truncate font-semibold">{item.name}</span><span className="shrink-0 font-mono tabular-nums">{item.quantity} {item.unit}</span></li>)}</ul> : <p className="mt-4 rounded-xl bg-surface px-3 py-3 text-sm text-muted-foreground">{zhCN.shoppingAutoEmpty}</p>}</div></div></section>
    <section className="mb-6 rounded-3xl border border-border bg-surface p-5 shadow-card"><div className="mb-4 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-xl bg-avocado/10 text-avocado"><Plus size={17}/></span><h2 className="font-bold">{zhCN.addShoppingItem}</h2></div><form onSubmit={form.handleSubmit((value) => add.mutate(value))} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px_100px_minmax(150px,190px)_auto]">
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">{zhCN.shoppingItemName}<input {...form.register("name")} placeholder={zhCN.shoppingItemPlaceholder} className="field text-sm"/></label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">{zhCN.shoppingQuantity}<input {...form.register("quantity")} type="number" min="0.01" step="any" className="field font-mono tabular-nums"/></label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">{zhCN.shoppingUnit}<select {...form.register("unit")} className="field">{units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">{zhCN.ingredientName}<select {...form.register("ingredient_id")} onChange={(event) => { form.setValue("ingredient_id", event.target.value); const ingredient = ingredients.data?.find((item) => item.id === event.target.value); if (ingredient) { form.setValue("name", ingredient.name); form.setValue("unit", ingredient.unit as AddForm["unit"]); } }} className="field"><option value="">{zhCN.noIngredientLink}</option>{(ingredients.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <button disabled={add.isPending} type="submit" className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">{zhCN.saveShoppingItem}</button>
      {(form.formState.errors.name || form.formState.errors.quantity) && <p className="text-xs text-danger sm:col-span-full">{form.formState.errors.name?.message ?? form.formState.errors.quantity?.message}</p>}
    </form></section>
    <section><div className="mb-3 flex items-end justify-between gap-3"><div><h2 className="text-xl font-bold">{zhCN.shopping}</h2><p className="mt-1 text-sm text-muted-foreground">{open.length} {zhCN.shoppingQuantity}</p></div></div>
      {list.isLoading ? <div aria-label={zhCN.menuGapRefresh} className="grid gap-3">{[0,1,2].map((index) => <div key={index} className="h-20 animate-pulse rounded-2xl bg-muted"/>)}</div> : list.error ? <p role="alert" className="rounded-2xl bg-danger/10 p-4 text-sm text-danger">{(list.error as Error).message}</p> : items.length === 0 ? <div className="rounded-3xl border border-border bg-surface px-6 py-12 text-center shadow-card"><div role="img" aria-label={zhCN.emptyIllustrationAlt} className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-avocado/10 text-4xl">🧺</div><h3 className="mt-4 text-lg font-bold">{zhCN.shoppingEmpty}</h3><p className="mt-2 text-sm text-muted-foreground">{zhCN.shoppingEmptyHint}</p></div> : <ul className="grid gap-3">{items.map((item) => <li key={item.id} className={`flex min-w-0 flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-3 shadow-card sm:flex-nowrap sm:p-4 ${item.checked ? "opacity-70" : ""}`}>
        <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3"><input type="checkbox" checked={item.checked} onChange={(event) => toggle.mutate({ item, checked: event.target.checked })} aria-label={`${zhCN.markPurchased} ${item.name}`} className="h-5 w-5 shrink-0 accent-brand"/><span className={`min-w-0 truncate font-semibold ${item.checked ? "line-through text-muted-foreground" : ""}`}>{item.name}</span><span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">{item.note === "auto:menu-gap" ? zhCN.shoppingAutoTag : zhCN.shoppingManualTag}</span></label>
        {editing === item.id ? <div className="flex items-center gap-2"><input aria-label={`${zhCN.editQuantity} ${item.name}`} type="number" min="0.01" step="any" value={editQuantity} onChange={(event) => setEditQuantity(event.target.value)} className="field w-24 font-mono"/><span className="text-sm">{item.unit}</span><button type="button" onClick={() => saveQuantity.mutate({ item, quantity: Number(editQuantity) })} disabled={!Number.isFinite(Number(editQuantity)) || Number(editQuantity) <= 0} className="rounded-xl bg-brand px-3 py-2 text-xs font-semibold text-white">{zhCN.updateShoppingItem}</button></div> : <div className="flex shrink-0 items-center gap-2"><span className="font-mono text-lg font-bold tabular-nums">{item.quantity}</span><span className="text-sm text-muted-foreground">{item.unit}</span><button type="button" onClick={() => { setEditing(item.id); setEditQuantity(String(item.quantity)); }} className="rounded-xl px-2 py-2 text-xs font-semibold text-brand">{zhCN.editQuantity}</button></div>}
        {item.checked && <button type="button" onClick={() => stockIn.mutate(item)} disabled={stockIn.isPending} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-avocado px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><PackageCheck size={16}/>{zhCN.stockIn}</button>}
        <button type="button" onClick={() => remove.mutate(item.id)} aria-label={`${zhCN.delete} ${item.name}`} className="rounded-xl p-2 text-muted-foreground hover:bg-muted"><Trash2 size={17}/></button>
      </li>)}</ul>}
    </section>
    {items.some((item) => item.checked) && <p className="mt-4 flex items-center gap-2 text-sm text-avocado"><Check size={16}/>{items.filter((item) => item.checked).length} {zhCN.purchasedItem}</p>}
  </main></AppShell>;
}
