"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChefHat, Clock3, Plus, ShoppingBasket, Users } from "lucide-react";
import { scaleRecipe } from "@/lib/planner/scale-recipe";
import type { PlannerRecipe, RecipeIngredient } from "@/lib/planner/types";
import { UNIT_BASE } from "@/lib/units";
import { zhCN } from "@/lib/i18n/zh-CN";
import { CookingMode, type CookingStep } from "@/components/recipes/cooking-mode";
import { ImageLightbox, RecipeVisual, type GalleryImage } from "@/components/recipes/recipe-media";

interface ApiResponse<T> { code: number; data: T; message: string }
interface InventoryItem { id: string; name: string; unit: string; stock_qty: number }
export interface RecipeDetailData extends Omit<PlannerRecipe, "steps" | "image_url"> { image_url?: string | null; steps: CookingStep[]; source?: string; review_status?: string }

async function loadInventory(): Promise<InventoryItem[]> {
  const response = await fetch("/api/ingredients");
  const result = await response.json() as ApiResponse<InventoryItem[]>;
  if (!response.ok || result.code >= 400) throw new Error(result.message);
  return result.data;
}
function currentStockInUnit(ingredient: RecipeIngredient, inventory: InventoryItem[]): number {
  const matched = inventory.find((item) => ingredient.ingredient_id ? item.id === ingredient.ingredient_id : item.name.trim().toLocaleLowerCase() === ingredient.name.trim().toLocaleLowerCase());
  if (!matched) return 0;
  const required = UNIT_BASE[ingredient.unit]; const actual = UNIT_BASE[matched.unit];
  if (!required || !actual || required.dimension !== actual.dimension) return 0;
  return matched.stock_qty * actual.factor / required.factor;
}
function formatAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function RecipeDetail({ recipe }: { recipe: RecipeDetailData }) {
  const [servings, setServings] = useState(2);
  const [cooking, setCooking] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const inventoryQuery = useQuery({ queryKey: ["recipe-detail", "inventory"], queryFn: loadInventory });
  const inventory = inventoryQuery.data ?? [];
  const scaled = useMemo(() => scaleRecipe({ ...recipe, image_url: recipe.image_url ?? undefined, steps: recipe.steps.map((step) => step.instruction) }, servings), [recipe, servings]);
  const steps = recipe.steps.length ? recipe.steps : [{ title: zhCN.cookingMethod, instruction: zhCN.noRecipeSteps }];
  const gallery: GalleryImage[] = steps.map((step, index) => ({ src: step.image_url || recipe.image_url, alt: `${recipe.name}，${zhCN.stepLabel}${index + 1}` }));

  const addShortage = async (ingredient: RecipeIngredient, quantity: number) => {
    const response = await fetch("/api/shopping-items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: ingredient.name, quantity, unit: ingredient.unit, ingredient_id: ingredient.ingredient_id ?? null, checked: false }) });
    setNotice(response.ok ? zhCN.shoppingAdded : zhCN.shoppingAddFailed);
  };

  return <main id="main-content" className="mx-auto max-w-5xl px-4 pb-32 pt-5 sm:px-8 lg:px-10">
    <Link href="/" className="mb-4 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted"><ArrowLeft size={18} />{zhCN.backToMenu}</Link>
    <section className="relative h-64 overflow-hidden rounded-3xl shadow-soft sm:h-80 lg:h-[26rem]"><RecipeVisual src={recipe.image_url} name={recipe.name} className="h-full w-full" /><div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-foreground/80 to-transparent px-6 pb-6 pt-20 text-background sm:px-9 sm:pb-9"><div className="flex flex-wrap items-center gap-3 text-sm font-medium"><span className="rounded-full bg-surface/20 px-3 py-1 backdrop-blur">{recipe.meal_type === "breakfast" ? zhCN.breakfast : recipe.meal_type === "lunch" ? zhCN.lunch : zhCN.dinner}</span><span className="inline-flex items-center gap-1"><Clock3 size={15} />{recipe.duration_min} {zhCN.minuteShort}</span>{recipe.nutrition?.calories !== undefined && <span>{recipe.nutrition.calories} {zhCN.caloriesUnit}</span>}</div><h1 className="mt-3 text-3xl font-bold sm:text-4xl">{recipe.name}</h1></div></section>
    {notice && <p role="status" className="mt-4 rounded-xl bg-avocado/10 px-4 py-3 text-sm font-semibold text-avocado">{notice}</p>}
    <section className="mt-6 rounded-3xl border border-border bg-surface p-5 shadow-card sm:p-7"><div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-xl font-bold">{zhCN.ingredientList}</h2><p className="mt-1 text-sm text-muted-foreground">{zhCN.scaleIngredientsHint}</p></div><label className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-2 text-sm font-semibold"><Users size={17} /><span>{zhCN.servings}</span><select value={servings} onChange={(event) => setServings(Number(event.target.value))} aria-label={zhCN.servings} className="bg-transparent font-mono"><option value={1}>1</option><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option><option value={6}>6</option></select></label></div>
      <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[34rem] border-separate border-spacing-0 text-left text-sm"><thead><tr className="text-muted-foreground"><th scope="col" className="border-b border-border px-3 py-3 font-medium">{zhCN.ingredientName}</th><th scope="col" className="border-b border-border px-3 py-3 font-medium">{zhCN.ingredientAmount}</th><th scope="col" className="border-b border-border px-3 py-3 font-medium">{zhCN.inventoryCurrent}</th><th scope="col" className="border-b border-border px-3 py-3 font-medium">{zhCN.moreActions}</th></tr></thead><tbody>{scaled.scaled_ingredients.map((ingredient, index) => { const stock = currentStockInUnit(ingredient, inventory); const shortfall = Math.max(0, ingredient.quantity - stock); const low = shortfall > 0.0001; const item = inventory.find((entry) => ingredient.ingredient_id ? entry.id === ingredient.ingredient_id : entry.name.trim().toLocaleLowerCase() === ingredient.name.trim().toLocaleLowerCase()); return <tr key={`${ingredient.name}-${index}`}><th scope="row" className="border-b border-border/70 px-3 py-4 font-semibold">{ingredient.name}</th><td className="border-b border-border/70 px-3 py-4 font-mono tabular-nums">{formatAmount(ingredient.quantity)} {ingredient.unit}</td><td className={`border-b border-border/70 px-3 py-4 font-mono tabular-nums ${low ? "text-danger" : "text-avocado"}`}>{item ? `${formatAmount(item.stock_qty)} ${item.unit}` : zhCN.notInInventory}{low && <span className="ml-2 text-xs font-sans">{zhCN.shortage}</span>}</td><td className="border-b border-border/70 px-3 py-4">{low && <button type="button" onClick={() => void addShortage(ingredient, shortfall)} className="inline-flex items-center gap-1 rounded-lg bg-brand/10 px-3 py-2 text-xs font-semibold text-brand"><Plus size={15} />{zhCN.addToShoppingList}</button>}</td></tr>; })}</tbody></table></div>{inventoryQuery.isLoading && <div className="mt-3 h-4 w-48 animate-pulse rounded bg-muted" />}</section>
    <section className="mt-8"><div className="mb-4 flex items-end justify-between gap-3"><div><h2 className="text-xl font-bold">{zhCN.recipeSteps}</h2><p className="mt-1 text-sm text-muted-foreground">{zhCN.tapImageToEnlarge}</p></div><span className="rounded-full bg-avocado/10 px-3 py-1.5 text-sm font-semibold text-avocado">{steps.length} {zhCN.stepsCount}</span></div><ol className="relative space-y-4 before:absolute before:bottom-8 before:left-5 before:top-5 before:w-px before:bg-border">{steps.map((step, index) => <li key={`${step.title}-${index}`} className="relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3"><span className="z-10 grid h-10 w-10 place-items-center rounded-full bg-brand text-base font-bold text-brand-foreground">{index + 1}</span><article className="min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5"><h3 className="text-lg font-bold">{step.title}</h3><p className="mt-2 leading-7 text-muted-foreground">{step.instruction}</p><button type="button" onClick={() => setGalleryIndex(index)} aria-label={`${zhCN.enlargeStepImage}：${step.title}`} className="mt-4 block w-full overflow-hidden rounded-xl text-left"><RecipeVisual src={step.image_url || recipe.image_url} name={recipe.name} className="h-48 w-full sm:h-64" /></button></article></li>)}</ol></section>
    <div className="fixed inset-x-0 bottom-14 z-10 mx-auto max-w-5xl px-4 lg:bottom-4"><button type="button" onClick={() => setCooking(true)} className="flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-brand px-6 py-4 text-lg font-bold text-brand-foreground shadow-soft sm:text-xl"><ChefHat size={24} />{zhCN.startCooking}</button></div>
    {galleryIndex !== null && <ImageLightbox images={gallery} activeIndex={galleryIndex} onChange={setGalleryIndex} onClose={() => setGalleryIndex(null)} />}
    {cooking && <CookingMode name={recipe.name} imageUrl={recipe.image_url} steps={steps} onExit={() => setCooking(false)} />}
  </main>;
}
