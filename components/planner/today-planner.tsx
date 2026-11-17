"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, Reorder, motion } from "framer-motion";
import { Check, Clock3, ChevronDown, ChevronUp, RefreshCw, Settings2, ShoppingBasket, Sparkles, UtensilsCrossed, X } from "lucide-react";
import { zhCN } from "@/lib/i18n/zh-CN";
import { classifyRecipe, createPlan, generateMeals, scoreRecipeCandidate } from "@/lib/planner";
import type { GenerateMealsInput, InventoryStock, MealType, Plan, PlannerRecipe, UserPreferences } from "@/lib/planner";
import { CompletionDialog, type CompletionSubmission } from "@/components/planner/completion-dialog";
import { UNIT_BASE } from "@/lib/units";

interface ApiResponse<T> { code: number; data: T; message: string }
interface IngredientRecord { id: string; name: string; stock_qty: number; unit: string; cost_per_unit?: number; expiry_date?: string | null }
interface RecipeRecord extends Omit<PlannerRecipe, "ingredients" | "steps" | "tags" | "nutrition"> { ingredients: unknown; steps: unknown; tags: unknown; nutrition: unknown; image_url: string }
interface PendingAiRecipe { id: string; name: string; steps: Array<{ title: string; instruction: string; image_url?: string }>; review_status: string; image_url: string }
interface AiUsageSummary { calls: number; promptTokens: number; completionTokens: number; totalTokens: number; averageDurationMs: number; estimatedCost: number; currency: string; windowDays: number }
const mealLabels: Record<MealType, string> = { breakfast: zhCN.breakfast, lunch: zhCN.lunch, dinner: zhCN.dinner };
const dishLabels = { meat: zhCN.meatDish, vegetable: zhCN.vegetableDish, staple: zhCN.stapleDish, other: zhCN.recipes } as const;
const cookwareOptions = [{ value: "炒锅", label: zhCN.cookwarePan }, { value: "蒸锅", label: zhCN.cookwareSteamer }, { value: "烤箱", label: zhCN.cookwareOven }, { value: "电饭煲", label: zhCN.cookwareRiceCooker }];
const initialPreferences: UserPreferences = { calorieTarget: 700, maxCookingMinutes: 90, availableCookware: [] };
const todayKey = () => new Date().toISOString().slice(0, 10);
const safeArray = <T,>(value: unknown): T[] => Array.isArray(value) ? value as T[] : [];

async function loadApi<T>(path: string): Promise<T> {
  const response = await fetch(path);
  const result = await response.json() as ApiResponse<T>;
  if (!response.ok || result.code >= 400) throw new Error(result.message || "Request failed");
  return result.data;
}
function normalizeRecipe(row: RecipeRecord): PlannerRecipe {
  const nutrition = row.nutrition && typeof row.nutrition === "object" ? row.nutrition as { calories?: number } : undefined;
  const ingredients = safeArray<PlannerRecipe["ingredients"][number]>(row.ingredients).map((item) => ({ ...item, ingredient_id: item.ingredient_id ?? undefined }));
  const steps = safeArray<unknown>(row.steps).map((step) => typeof step === "string" ? step : step && typeof step === "object" && "instruction" in step && typeof step.instruction === "string" ? step.instruction : "").filter(Boolean);
  return { id: row.id, name: row.name, meal_type: row.meal_type, ingredients, steps, duration_min: row.duration_min, tags: safeArray<string>(row.tags), nutrition, image_url: row.image_url, cookware_required: row.cookware_required, servings: row.servings };
}
function toInventory(rows: IngredientRecord[]): InventoryStock[] {
  return rows.map((item) => ({ ingredient_id: item.id, name: item.name, quantity: item.stock_qty, unit: item.unit, expiry_date: item.expiry_date, cost_per_unit: item.cost_per_unit }));
}
function usePlannerData() {
  const recipes = useQuery({ queryKey: ["planner", "recipes"], queryFn: () => loadApi<RecipeRecord[]>("/api/recipes") });
  const ingredients = useQuery({ queryKey: ["planner", "ingredients"], queryFn: () => loadApi<IngredientRecord[]>("/api/ingredients"), refetchInterval: 4000 });
  const preferences = useQuery({ queryKey: ["preferences"], queryFn: async () => { const response = await fetch("/api/preferences"); if (!response.ok) return null; const result = await response.json() as ApiResponse<{ avoid: string[]; allergies: string[]; taste: number; calorieTarget: number; vegetarian: boolean; maxCookingMinutes: number; availableCookware: string[]; budget: number }>; return result.data; } });
  const pendingRecipes = useQuery({ queryKey: ["planner", "pending-ai-recipes"], queryFn: () => loadApi<PendingAiRecipe[]>("/api/recipes?source=ai&review_status=pending") });
  const recentPlans = useQuery({ queryKey: ["planner", "recent-plans", todayKey()], queryFn: async () => {
    const dates = Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() - index); return date.toISOString().slice(0, 10); });
    const days = await Promise.all(dates.map((date) => loadApi<Array<{ recipe_id: string | null }>>(`/api/plans?date=${date}`)));
    return days.flat().map((plan) => plan.recipe_id).filter((id): id is string => Boolean(id));
  } });
  const usage = useQuery({ queryKey: ["planner", "ai-usage"], queryFn: () => loadApi<AiUsageSummary>("/api/ai-usage") });
  return { recipes, ingredients, preferences, pendingRecipes, recentPlans, usage, isLoading: recipes.isLoading || ingredients.isLoading || recentPlans.isLoading, error: recipes.error ?? ingredients.error ?? recentPlans.error };
}

async function persistPlans(rows: Plan[]): Promise<Plan[]> {
  return Promise.all(rows.map(async (plan) => {
    const response = await fetch("/api/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: plan.date, meal_type: plan.meal_type, recipe_id: plan.recipe_id, servings: plan.servings, status: "planned" }) });
    const result = await response.json() as ApiResponse<{ id: string }>;
    if (!response.ok || result.code >= 400) throw new Error(result.message || zhCN.mealCompletionFailed);
    return { ...plan, id: result.data.id };
  }));
}

function LoadingMenu() {
  return <div aria-label={zhCN.generatingMenu} className="grid gap-4 lg:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="animate-pulse rounded-3xl border border-border bg-surface p-5 shadow-card"><div className="h-5 w-20 rounded-full bg-muted" /><div className="mt-6 h-6 w-3/4 rounded-lg bg-muted" /><div className="mt-4 h-4 w-1/2 rounded bg-muted" /><div className="mt-8 h-20 rounded-2xl bg-muted" /></div>)}</div>;
}

function PreferencesDialog({ value, onClose, onSave }: { value: UserPreferences; onClose: () => void; onSave: (value: UserPreferences, servings: number) => void }) {
  const [prefs, setPrefs] = useState(value);
  const [servings, setServings] = useState(2);
  const list = (input: string) => input.split(/[，,]/).map((item) => item.trim()).filter(Boolean);
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/35 p-0 sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="preferences-title" className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-background p-6 shadow-soft sm:max-w-lg sm:rounded-3xl">
      <div className="flex items-center justify-between"><h2 id="preferences-title" className="text-xl font-bold">{zhCN.preferencesTitle}</h2><button type="button" onClick={onClose} aria-label={zhCN.close} className="rounded-full p-2 hover:bg-muted"><X size={20} /></button></div>
      <div className="mt-5 grid gap-4">
        <label className="grid gap-1 text-sm font-medium">{zhCN.servings}<input type="number" min={1} max={12} value={servings} onChange={(event) => setServings(Number(event.target.value))} className="rounded-xl border border-border bg-surface px-3 py-2 text-base" /></label>
        <label className="grid gap-1 text-sm font-medium">{zhCN.calorieGoal}<input type="number" min={100} max={2000} value={prefs.calorieTarget ?? 700} onChange={(event) => setPrefs({ ...prefs, calorieTarget: Number(event.target.value) })} className="rounded-xl border border-border bg-surface px-3 py-2 text-base" /></label>
        <label className="grid gap-1 text-sm font-medium">{zhCN.cookingLimit}<input type="number" min={10} max={240} value={prefs.maxCookingMinutes ?? 90} onChange={(event) => setPrefs({ ...prefs, maxCookingMinutes: Number(event.target.value) })} className="rounded-xl border border-border bg-surface px-3 py-2 text-base" /></label>
        <label className="flex items-center gap-3 rounded-xl bg-muted p-3 text-sm font-medium"><input type="checkbox" checked={prefs.vegetarian ?? false} onChange={(event) => setPrefs({ ...prefs, vegetarian: event.target.checked })} className="h-5 w-5 accent-brand" />{zhCN.vegetarianOnly}</label>
        <label className="grid gap-1 text-sm font-medium">{zhCN.avoidIngredients}<input value={(prefs.avoid ?? []).join("，")} onChange={(event) => setPrefs({ ...prefs, avoid: list(event.target.value) })} className="rounded-xl border border-border bg-surface px-3 py-2 text-base" /></label>
        <label className="grid gap-1 text-sm font-medium">{zhCN.allergyIngredients}<input value={(prefs.allergies ?? []).join("，")} onChange={(event) => setPrefs({ ...prefs, allergies: list(event.target.value) })} className="rounded-xl border border-border bg-surface px-3 py-2 text-base" /></label>
        <label className="grid gap-1 text-sm font-medium">{zhCN.favoriteTastes}<input value={(prefs.tastes ?? []).join("，")} onChange={(event) => setPrefs({ ...prefs, tastes: list(event.target.value) })} className="rounded-xl border border-border bg-surface px-3 py-2 text-base" /></label>
        <fieldset className="grid gap-2"><legend className="text-sm font-medium">{zhCN.availableCookware}</legend><div className="flex flex-wrap gap-2">{cookwareOptions.map((item) => <label key={item.value} className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-2 text-sm"><input type="checkbox" checked={(prefs.availableCookware ?? []).includes(item.value)} onChange={(event) => setPrefs({ ...prefs, availableCookware: event.target.checked ? [...(prefs.availableCookware ?? []), item.value] : (prefs.availableCookware ?? []).filter((tool) => tool !== item.value) })} className="accent-brand" />{item.label}</label>)}</div></fieldset>
      </div>
      <button type="button" onClick={() => onSave(prefs, Math.max(1, servings))} className="mt-6 w-full rounded-2xl bg-brand px-4 py-3 font-semibold text-white">{zhCN.savePreferences}</button>
    </section>
  </div>;
}

export function TodayPlanner() {
  const queryClient = useQueryClient();
  const accountMode = useQuery({ queryKey: ["account-mode"], queryFn: async () => { const response = await fetch("/api/account"); if (!response.ok) return false; const result = await response.json() as ApiResponse<{ local_mode: boolean }>; return result.data.local_mode; }, staleTime: 60_000 });
  const { recipes, ingredients, preferences: savedPreferences, pendingRecipes, recentPlans, usage, isLoading, error } = usePlannerData();
  const [preferences, setPreferences] = useState<UserPreferences>(initialPreferences);
  const [servings, setServings] = useState(2);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [order, setOrder] = useState<MealType[]>(["breakfast", "lunch", "dinner"]);
  const [details, setDetails] = useState<string[]>([]);
  const [swapMeal, setSwapMeal] = useState<MealType | null>(null);
  const [swapRecipeId, setSwapRecipeId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [notice, setNotice] = useState("");
  const [viewWeek, setViewWeek] = useState(false);
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [pendingAiRecipes, setPendingAiRecipes] = useState<PendingAiRecipe[] | null>(null);
  const [completionPlans, setCompletionPlans] = useState<Plan[] | null>(null);
  const [completionError, setCompletionError] = useState("");
  const [completionBusy, setCompletionBusy] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const [completedPulse, setCompletedPulse] = useState<string[]>([]);
  const appliedPreferenceUpdate = useRef(false);
  const rows = useMemo(() => (recipes.data ?? []).map(normalizeRecipe), [recipes.data]);
  const stock = useMemo(() => toInventory(ingredients.data ?? []), [ingredients.data]);
  const generationInput = (date: string, recentRecipeIds: string[] = recentPlans.data ?? []): GenerateMealsInput => ({ recipes: rows, inventory: stock, preferences, targetDate: date, servings, recentRecipeIds });

  useEffect(() => {
    const value = savedPreferences.data;
    if (!value) return;
    const cookware: Record<string, string> = { wok: "炒锅", steamer: "蒸锅", oven: "烤箱", rice_cooker: "电饭煲", microwave: "微波炉", air_fryer: "空气炸锅" };
    const mapped: UserPreferences = { avoid: value.avoid, allergies: value.allergies, calorieTarget: Math.round(value.calorieTarget / 3), maxCookingMinutes: value.maxCookingMinutes, vegetarian: value.vegetarian, budget: value.budget, tastes: value.taste < 35 ? ["清淡"] : value.taste > 65 ? ["重口"] : [], availableCookware: value.availableCookware.map((item) => cookware[item] ?? item) };
    setPreferences(mapped);
    if (!appliedPreferenceUpdate.current && typeof window !== "undefined" && localStorage.getItem("mealkeeper-preferences-updated") === "1" && recipes.isSuccess && ingredients.isSuccess) {
      appliedPreferenceUpdate.current = true; localStorage.removeItem("mealkeeper-preferences-updated"); setIsGenerating(true);
      void (async () => { try { await fetch(`/api/plans?date=${todayKey()}`, { method: "DELETE" }); const generated = generateMeals({ recipes: rows, inventory: stock, preferences: mapped, targetDate: todayKey(), servings }); setPlans(await persistPlans(generated)); setSelectedDate(todayKey()); setViewWeek(false); setNotice(zhCN.preferencesUpdated); } catch { setNotice(zhCN.loadError); } finally { setIsGenerating(false); } })();
    }
  }, [savedPreferences.data, recipes.isSuccess, ingredients.isSuccess, rows, stock, servings]);

  const generateWithAi = async () => {
    if (accountMode.data) { setNotice(zhCN.localModeAiDisabled); return; }
    setIsGenerating(true); setNotice(""); setPendingAiRecipes(null);
    try {
      const response = await fetch("/api/ai-meals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(generationInput(todayKey())) });
      const result = await response.json() as ApiResponse<{ plans: Plan[]; pendingRecipes: PendingAiRecipe[]; fallback: boolean }>;
      if (!response.ok || result.code >= 400) throw new Error(result.message);
      setPlans(await persistPlans(result.data.plans)); setPendingAiRecipes([...new Map([...(pendingRecipes.data ?? []), ...result.data.pendingRecipes].map((recipe) => [recipe.id, recipe])).values()]); void queryClient.invalidateQueries({ queryKey: ["planner", "pending-ai-recipes"] }); setViewWeek(false); setSelectedDate(todayKey()); setNotice(result.data.fallback ? (result.message || zhCN.usedLocalPlan) : zhCN.planReady);
    } catch {
      setPlans(await persistPlans(generateMeals(generationInput(todayKey())))); setViewWeek(false); setSelectedDate(todayKey()); setNotice(zhCN.usedLocalPlan);
    } finally { setIsGenerating(false); void queryClient.invalidateQueries({ queryKey: ["planner", "ai-usage"] }); }
  };

  const reviewAiRecipe = async (id: string, action: "approve" | "reject") => {
    const response = await fetch(`/api/recipes/${id}/review`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    if (response.ok) { setPendingAiRecipes((current) => (current ?? pendingRecipes.data ?? []).filter((recipe) => recipe.id !== id)); void queryClient.invalidateQueries({ queryKey: ["planner", "recipes"] }); void queryClient.invalidateQueries({ queryKey: ["planner", "pending-ai-recipes"] }); setNotice(zhCN.recipeAdopted); }
  };
  const uploadStepImage = async (id: string, stepIndex: number, file: File) => {
    const form = new FormData(); form.set("file", file); form.set("stepIndex", String(stepIndex));
    const response = await fetch(`/api/recipes/${id}/images`, { method: "POST", body: form });
    setNotice(response.ok ? zhCN.imageUploadSuccess : zhCN.imageUploadFailure);
    if (response.ok) { void queryClient.invalidateQueries({ queryKey: ["planner", "pending-ai-recipes"] }); setPendingAiRecipes(null); }
  };

  const regenerate = async (week = false) => {
    setIsGenerating(true); setNotice("");
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 350));
      if (!week) { setPlans(await persistPlans(generateMeals(generationInput(todayKey())))); setSelectedDate(todayKey()); setViewWeek(false); }
      else {
        const generated: Plan[] = []; const used: string[] = [...(recentPlans.data ?? [])];
        for (let offset = 0; offset < 7; offset += 1) {
          const date = new Date(); date.setDate(date.getDate() + offset);
          const dayPlans = generateMeals(generationInput(date.toISOString().slice(0, 10), used));
          generated.push(...dayPlans); used.push(...dayPlans.map((plan) => plan.recipe_id));
        }
        setPlans(await persistPlans(generated)); setSelectedDate(todayKey()); setViewWeek(true);
      }
      setNotice(week ? zhCN.weekReady : zhCN.planReady);
    } catch (error) { setNotice(error instanceof Error ? error.message : zhCN.loadError); }
    finally { setIsGenerating(false); }
  };

  if (isLoading || isGenerating) return <main id="main-content" className="mx-auto max-w-7xl px-4 pb-28 pt-8 sm:px-8 lg:px-10 lg:pb-12"><header className="mb-8"><div className="h-8 w-64 animate-pulse rounded-lg bg-muted" /><div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-muted" /></header><LoadingMenu /></main>;
  if (error) return <main id="main-content" className="mx-auto max-w-4xl px-5 py-16 text-center"><p className="text-lg font-semibold">{zhCN.loadError}</p><button className="mt-5 rounded-xl bg-brand px-5 py-3 font-semibold text-white" onClick={() => void queryClient.invalidateQueries({ queryKey: ["planner"] })}>{zhCN.retry}</button></main>;
  const activeDate = viewWeek ? selectedDate : (plans.length ? plans[0].date.slice(0, 10) : todayKey());
  const mealPlans = (mealType: MealType) => plans.filter((plan) => plan.meal_type === mealType && plan.date.slice(0, 10) === activeDate);
  const candidates = (mealType: MealType) => {
    const current = mealPlans(mealType); const selected = current.map((plan) => rows.find((row) => row.id === plan.recipe_id)).filter((row): row is PlannerRecipe => Boolean(row));
    const target = swapRecipeId ?? undefined;
    const targetRecipe = selected.find((row) => row.id === target) ?? selected[0];
    const targetDish = targetRecipe ? classifyRecipe(targetRecipe) : undefined;
    return rows.filter((recipe) => { if (recipe.meal_type !== mealType || recipe.id === targetRecipe?.id || (targetDish && classifyRecipe(recipe) !== targetDish)) return false; if (plans.some((plan) => plan.recipe_id === recipe.id && plan.date.slice(0, 10) === activeDate)) return false; const remaining = current.filter((plan) => plan.recipe_id !== target); const mealInput = generationInput(activeDate); const set = [...remaining.map((plan) => plan.recipe), recipe]; const uniqueMains = set.flatMap((item) => item.ingredients.filter((ingredient) => ingredient.role === "main").map((ingredient) => ingredient.ingredient_id ?? ingredient.name.toLocaleLowerCase())); if (new Set(uniqueMains).size !== uniqueMains.length) return false; if ((preferences.maxCookingMinutes !== undefined && set.reduce((sum, item) => sum + item.duration_min, 0) > preferences.maxCookingMinutes) || (preferences.calorieTarget !== undefined && set.reduce((sum, item) => sum + (item.nutrition?.calories ?? 0), 0) / Math.max(1, servings) > preferences.calorieTarget * 1.15)) return false; return Boolean(mealInput); }).map((recipe) => ({ recipe, ...scoreRecipeCandidate(recipe, stock, preferences, new Date(activeDate), servings) })).sort((a, b) => b.score - a.score);
  };
  const switchRecipe = async (oldId: string, replacement: PlannerRecipe, mealType: MealType) => {
    const input = generationInput(activeDate);
    const current = plans.find((plan) => plan.recipe_id === oldId);
    const fresh = current ? createPlan(replacement, input, mealType) : null;
    if (fresh && current) { const [saved] = await persistPlans([fresh]); setPlans((items) => items.map((plan) => plan.id === current.id ? { ...saved, id: saved.id, servings: current.servings } : plan)); }
    setSwapMeal(null); setSwapRecipeId(null);
  };
  const addGaps = async (selected: Plan[]) => {
    const gaps = selected.flatMap((plan) => plan.shoppingGaps);
    if (!gaps.length) { setNotice(zhCN.inventoryEnough); return; }
    const response = await Promise.all(gaps.map((gap) => fetch("/api/shopping-items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: gap.name, quantity: gap.quantity, unit: gap.unit, checked: false }) })));
    if (response.every((item) => item.ok)) setNotice(zhCN.shoppingAdded);
  };

  const completeSelection = async (submission: CompletionSubmission) => {
    setCompletionBusy(true); setCompletionError("");
    const previousStock = ingredients.data ?? [];
    const previousPlans = plans;
    const previousIngredientPage = queryClient.getQueryData<Array<{ id: string; stock_qty: number }>>(["ingredients"]);
    const uses = submission.plans.flatMap((selection) => selection.actual_usage.map((item) => {
      const ingredient = previousStock.find((row) => row.id === item.ingredient_id);
      const from = UNIT_BASE[item.unit]; const to = ingredient ? UNIT_BASE[ingredient.unit] : undefined;
      const amount = ingredient && from && to && from.dimension === to.dimension ? item.quantity * from.factor / to.factor : item.quantity;
      return { id: item.ingredient_id, amount };
    }));
    queryClient.setQueryData<IngredientRecord[]>(["planner", "ingredients"], previousStock.map((item) => ({ ...item, stock_qty: Math.max(0, item.stock_qty - uses.filter((use) => use.id === item.id).reduce((sum, use) => sum + use.amount, 0)) })));
    if (previousIngredientPage) queryClient.setQueryData(["ingredients"], previousIngredientPage.map((item) => ({ ...item, stock_qty: Math.max(0, item.stock_qty - uses.filter((use) => use.id === item.id).reduce((sum, use) => sum + use.amount, 0)) })));
    setPlans((current) => current.map((plan) => submission.plans.some((selection) => selection.plan_id === plan.id) ? { ...plan, status: "finished" } : plan));
    setCompletedPulse(submission.plans.map((item) => item.plan_id));
    try {
      const response = await fetch("/api/plans/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(submission) });
      const result = await response.json() as ApiResponse<{ inventory?: Array<{ ingredient_id: string; stock_qty: number }>; shortages?: Array<{ name: string; quantity: number; unit: string }> }>;
      if (!response.ok || result.code >= 400) {
        queryClient.setQueryData(["planner", "ingredients"], previousStock); if (previousIngredientPage) queryClient.setQueryData(["ingredients"], previousIngredientPage); setPlans(previousPlans); setCompletedPulse([]);
        if (response.status === 409 && result.data?.shortages?.length) { setCompletionError(`${result.data.shortages.map((item) => `${item.name} ${item.quantity} ${item.unit}`).join("、")} ${zhCN.shortageDebtPrompt}`); return; }
        throw new Error(result.message || zhCN.mealCompletionFailed);
      }
      if (result.data.inventory) {
        queryClient.setQueryData<IngredientRecord[]>(["planner", "ingredients"], (old = []) => old.map((item) => ({ ...item, stock_qty: result.data.inventory?.find((update) => update.ingredient_id === item.id)?.stock_qty ?? item.stock_qty })));
        queryClient.setQueryData<Array<{ id: string; stock_qty: number }>>(["ingredients"], (old = []) => old.map((item) => ({ ...item, stock_qty: result.data.inventory?.find((update) => update.ingredient_id === item.id)?.stock_qty ?? item.stock_qty })));
      }
      setCompletionPlans(null); setCompletionError(""); setNotice(zhCN.mealCompleted); setSelectedPlanIds([]); setBatchMode(false);
      window.setTimeout(() => setCompletedPulse([]), 1100);
      void queryClient.invalidateQueries({ queryKey: ["planner", "ingredients"] }); void queryClient.invalidateQueries({ queryKey: ["ingredients"] }); void queryClient.invalidateQueries({ queryKey: ["shopping-items"] }); void queryClient.invalidateQueries({ queryKey: ["planner", "recent-plans"] });
    } catch (error) { queryClient.setQueryData(["planner", "ingredients"], previousStock); if (previousIngredientPage) queryClient.setQueryData(["ingredients"], previousIngredientPage); setPlans(previousPlans); setCompletedPulse([]); setCompletionError(error instanceof Error ? error.message : zhCN.mealCompletionFailed); }
    finally { setCompletionBusy(false); }
  };

  const undoCompletion = async (plan: Plan, confirmed = false) => {
    const previous = plans; setPlans((current) => current.map((item) => item.id === plan.id ? { ...item, status: "planned" } : item));
    const response = await fetch(`/api/plans/${encodeURIComponent(plan.id)}/undo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm_old: confirmed }) });
    const result = await response.json() as ApiResponse<{ needs_confirmation?: boolean }>;
    if (response.status === 409 && result.data?.needs_confirmation && window.confirm(zhCN.confirmOldUndo)) { setPlans(previous); await undoCompletion(plan, true); return; }
    if (!response.ok || result.code >= 400) { setPlans(previous); setNotice(result.message || zhCN.mealCompletionFailed); return; }
    setNotice(zhCN.undoMealDone); void queryClient.invalidateQueries({ queryKey: ["planner", "ingredients"] }); void queryClient.invalidateQueries({ queryKey: ["ingredients"] });
  };

  const skipMeal = async (items: Plan[]) => {
    const pending = items.filter((plan) => plan.status === "planned"); if (!pending.length) return;
    const response = await fetch("/api/plans/skip", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan_ids: pending.map((plan) => plan.id) }) });
    if (!response.ok) { setNotice(zhCN.mealCompletionFailed); return; }
    setPlans((current) => current.map((plan) => pending.some((entry) => entry.id === plan.id) ? { ...plan, status: "skipped" } : plan)); setNotice(zhCN.noInventoryDeducted);
  };

  const displayedTypes = plans.length > 3 ? order : order;
  return <main id="main-content" className="mx-auto max-w-7xl px-4 pb-28 pt-7 sm:px-8 lg:px-10 lg:pb-12">
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-sm font-medium text-muted-foreground">{new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(new Date(`${activeDate}T12:00:00`))}</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{zhCN.todayMenuTitle}</h1><p className="mt-2 text-muted-foreground">{zhCN.todayMenuSubtitle}</p></div><div className="flex w-full flex-wrap gap-2 sm:w-auto"><button type="button" onClick={() => void regenerate()} className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm font-semibold shadow-card sm:flex-none"><RefreshCw size={16} />{zhCN.regenerateToday}</button><button type="button" disabled={accountMode.data} title={accountMode.data ? zhCN.localModeAiDisabled : undefined} onClick={() => void generateWithAi()} className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-3 text-sm font-semibold text-white shadow-card disabled:opacity-45 sm:flex-none"><Sparkles size={16} />{zhCN.aiGenerate}</button><button type="button" onClick={() => void regenerate(true)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm font-semibold shadow-card sm:flex-none"><Sparkles size={16} />{zhCN.generateWeek}</button><Link href="/settings" aria-label={zhCN.settings} className="rounded-2xl border border-border bg-surface p-3 shadow-card"><Settings2 size={19} /></Link></div></header>
    {accountMode.data && <p className="mb-4 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">{zhCN.localModeAiDisabled}</p>}{notice && <p role="status" className="mb-4 rounded-xl bg-avocado/10 px-4 py-3 text-sm font-medium text-avocado">{notice}</p>}
    {(pendingAiRecipes ?? pendingRecipes.data ?? []).length > 0 && <section className="mb-5 rounded-3xl border border-brand/20 bg-brand/5 p-5"><h2 className="text-lg font-bold">{zhCN.pendingAiRecipes}</h2><div className="mt-3 grid gap-3 md:grid-cols-2">{(pendingAiRecipes ?? pendingRecipes.data ?? []).map((recipe) => <article key={recipe.id} className="rounded-2xl border border-border bg-surface p-4"><Image src="/illustrations/recipe-placeholder.svg" alt={recipe.name} width={640} height={420} className="mb-3 h-32 w-full rounded-xl object-cover" /><h3 className="font-semibold">{recipe.name}</h3><p className="mt-1 text-xs text-muted-foreground">{zhCN.awaitingReview}</p><ol className="mt-3 space-y-3">{recipe.steps.map((step, index) => <li key={`${recipe.id}-${index}`} className="rounded-xl bg-background p-3 text-sm"><strong>{step.title}</strong><p className="mt-1 text-muted-foreground">{step.instruction}</p>{step.image_url && <a href={step.image_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-brand">{zhCN.viewStepImage}</a>}<label className="mt-2 inline-flex cursor-pointer rounded-lg bg-muted px-3 py-2 text-xs font-semibold"><span>{zhCN.uploadStepImage}</span><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadStepImage(recipe.id, index, file); }} /></label></li>)}</ol><button type="button" onClick={() => void reviewAiRecipe(recipe.id, "approve")} className="mt-3 w-full rounded-xl bg-avocado px-4 py-2.5 text-sm font-semibold text-white">{zhCN.adoptRecipe}</button></article>)}</div></section>}
    {viewWeek && plans.length > 0 && <nav aria-label={zhCN.weeklyMenu} className="mb-4 flex gap-2 overflow-x-auto pb-2">{Array.from(new Set(plans.map((plan) => plan.date.slice(0, 10)))).map((date) => <button key={date} type="button" onClick={() => setSelectedDate(date)} aria-current={date === activeDate ? "date" : undefined} className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${date === activeDate ? "bg-brand text-white" : "bg-surface text-foreground shadow-card"}`}>{new Intl.DateTimeFormat("zh-CN", { weekday: "short", month: "numeric", day: "numeric" }).format(new Date(`${date}T12:00:00`))}</button>)}</nav>}
    {plans.length === 0 ? <section className="rounded-3xl border border-border bg-surface px-6 py-14 text-center shadow-card"><div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-avocado/10 text-4xl" role="img" aria-label={zhCN.menuIllustrationAlt}>🥕</div><h2 className="mt-5 text-xl font-bold">{rows.length ? zhCN.emptyState : zhCN.noMenuRecipes}</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{zhCN.todayMenuSubtitle}</p><button type="button" disabled={!rows.length} onClick={() => void regenerate()} className="mt-6 rounded-2xl bg-brand px-5 py-3 font-semibold text-white disabled:opacity-50">{zhCN.regenerateToday}</button></section> : <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-surface p-3 shadow-card"><button type="button" onClick={() => { setBatchMode((current) => !current); setSelectedPlanIds([]); }} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold">{batchMode ? zhCN.close : zhCN.batchComplete}</button>{batchMode && <div className="flex items-center gap-3"><span className="text-sm text-muted-foreground">{zhCN.completionSelected} {selectedPlanIds.length}</span><button type="button" disabled={!selectedPlanIds.length} onClick={() => { setCompletionError(""); setCompletionPlans(plans.filter((plan) => selectedPlanIds.includes(plan.id) && plan.status === "planned")); }} className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{zhCN.markSelectedDone}</button></div>}</div>
      <Reorder.Group axis="x" values={displayedTypes} onReorder={setOrder} className="grid gap-4 lg:grid-cols-3">
        {displayedTypes.map((mealType) => {
          const group = mealPlans(mealType);
          const pending = group.filter((plan) => plan.status === "planned");
          const totalMinutes = group.reduce((sum, plan) => sum + plan.recipe.duration_min, 0);
          const calories = Math.round(group.reduce((sum, plan) => sum + plan.recipe.scaled_calories, 0) / Math.max(1, servings));
          return (
            <Reorder.Item key={mealType} value={mealType} className="min-w-0">
              <motion.article layout className="h-full overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
                <div className="flex items-center justify-between border-b border-border bg-muted/60 px-5 py-4">
                  <div><span className="text-sm font-semibold text-muted-foreground">{mealLabels[mealType]}</span><h2 className="mt-1 text-lg font-bold">{zhCN.mealSummary} {totalMinutes}{zhCN.minuteShort} · {calories}{zhCN.caloriesUnit}</h2></div>
                  <span className="rounded-full bg-background p-2 text-muted-foreground" aria-label={zhCN.dragToReorder}><UtensilsCrossed size={18} /></span>
                </div>
                <div className="space-y-3 p-4">
                  {group.length ? group.map((plan) => (
                    <section key={plan.id} className={`rounded-2xl border border-border bg-background p-4 ${completedPulse.includes(plan.id) ? "ring-2 ring-avocado" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        {batchMode && plan.status === "planned" && <label className="mt-1"><input type="checkbox" aria-label={`${zhCN.selectForBatch} ${plan.recipe.name}`} checked={selectedPlanIds.includes(plan.id)} onChange={(event) => setSelectedPlanIds((current) => event.target.checked ? [...current, plan.id] : current.filter((id) => id !== plan.id))} className="h-5 w-5 accent-brand" /></label>}
                        <div className="min-w-0 flex-1"><span className="rounded-full bg-avocado/10 px-2.5 py-1 text-xs font-semibold text-avocado">{dishLabels[classifyRecipe(plan.recipe)]}</span><h3 className="mt-3 text-lg font-bold leading-snug"><Link href={`/recipes/${encodeURIComponent(plan.recipe_id)}`} className="hover:text-brand">{plan.recipe.name}</Link></h3></div>
                        <div className="flex items-center gap-1">
                          {plan.status === "finished" ? <><motion.span initial={{ scale: 0, rotate: -45 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 420, damping: 17 }} className="grid h-9 w-9 place-items-center rounded-full bg-avocado/10 text-avocado" aria-label={zhCN.doneMark}><Check size={20} /></motion.span><button type="button" onClick={() => void undoCompletion(plan)} className="rounded-xl px-2 py-2 text-xs font-semibold text-brand">{zhCN.undoMeal}</button></> : <button type="button" onClick={() => { setCompletionError(""); setCompletionPlans([plan]); }} disabled={plan.status !== "planned"} className="shrink-0 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white disabled:bg-muted disabled:text-muted-foreground">{plan.status === "skipped" ? zhCN.skipMeal : zhCN.markMealDone}</button>}
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground"><span className="inline-flex items-center gap-1"><Clock3 size={15} />{plan.recipe.duration_min}{zhCN.minuteShort}</span><span>{Math.round(plan.recipe.scaled_calories / Math.max(1, servings))}{zhCN.caloriesUnit}</span></div>
                      <button type="button" aria-expanded={details.includes(plan.id)} onClick={() => setDetails((current) => current.includes(plan.id) ? current.filter((id) => id !== plan.id) : [...current, plan.id])} className="mt-4 flex w-full items-center justify-between rounded-xl bg-muted px-3 py-2.5 text-sm font-semibold">{details.includes(plan.id) ? zhCN.hideDetails : zhCN.recipeDetails}{details.includes(plan.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
                      <AnimatePresence>{details.includes(plan.id) && <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">{plan.recipe.scaled_ingredients.map((item, index) => <li key={`${item.name}-${index}`} className="flex justify-between border-b border-border/70 py-2 text-sm last:border-0"><span>{item.name}</span><span className="font-mono tabular-nums">{item.quantity} {item.unit}</span></li>)}</motion.ul>}</AnimatePresence>
                      {plan.shoppingGaps.length > 0 && <p className="mt-3 text-xs font-medium text-brand">{zhCN.shoppingShortage}：{plan.shoppingGaps.map((gap) => gap.name).join("、")}</p>}
                    </section>
                  )) : <p className="rounded-2xl bg-muted px-4 py-8 text-center text-sm text-muted-foreground">{zhCN.noRecipesForMeal}</p>}
                </div>
                {group.some((plan) => plan.shoppingGaps.length > 0) && <button type="button" onClick={() => void addGaps(group)} className="mx-4 mb-4 inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-brand hover:bg-brand/10"><ShoppingBasket size={16} />{zhCN.addGapsToShopping}</button>}
                <div className="grid grid-cols-2 gap-2 px-4 pb-4"><button type="button" disabled={!pending.length} onClick={() => { setCompletionError(""); setCompletionPlans(pending); }} className="rounded-xl bg-brand px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{zhCN.markMealDone}</button><button type="button" disabled={!pending.length} onClick={() => void skipMeal(pending)} className="rounded-xl border border-border px-3 py-2.5 text-sm font-semibold disabled:opacity-40">{zhCN.skipMeal}</button></div>
              </motion.article>
            </Reorder.Item>
          );
        })}
      </Reorder.Group>
    </>}
    {usage.data && <section className="mt-6 rounded-3xl border border-border bg-surface p-5 shadow-card"><h2 className="text-lg font-bold">{zhCN.aiCostTitle}</h2><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"><div><p className="text-xs text-muted-foreground">{zhCN.aiCalls}</p><p className="mt-1 font-mono text-xl font-semibold tabular-nums">{usage.data.calls}</p></div><div><p className="text-xs text-muted-foreground">{zhCN.aiTokens}</p><p className="mt-1 font-mono text-xl font-semibold tabular-nums">{usage.data.totalTokens}</p></div><div><p className="text-xs text-muted-foreground">{zhCN.aiAverageLatency}</p><p className="mt-1 font-mono text-xl font-semibold tabular-nums">{usage.data.averageDurationMs} {zhCN.millisecondsShort}</p></div><div><p className="text-xs text-muted-foreground">{zhCN.aiEstimatedCost}</p><p className="mt-1 font-mono text-xl font-semibold tabular-nums">{new Intl.NumberFormat("en-US", { style: "currency", currency: usage.data.currency }).format(usage.data.estimatedCost)}</p></div></div></section>}
    {swapMeal && <div className="fixed inset-0 z-40 flex items-end justify-center bg-foreground/35 sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setSwapMeal(null); setSwapRecipeId(null); } }}><section role="dialog" aria-modal="true" aria-labelledby="swap-title" className="max-h-[82dvh] w-full overflow-y-auto rounded-t-3xl bg-background p-5 shadow-soft sm:max-w-xl sm:rounded-3xl"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">{mealLabels[swapMeal]}</p><h2 id="swap-title" className="text-xl font-bold">{zhCN.swapDish}</h2></div><button type="button" aria-label={zhCN.close} onClick={() => { setSwapMeal(null); setSwapRecipeId(null); }} className="rounded-full p-2 hover:bg-muted"><X size={20} /></button></div><div className="mt-4 grid gap-3">{candidates(swapMeal).map(({ recipe, reasons }) => { const old = mealPlans(swapMeal).find((plan) => plan.recipe_id === swapRecipeId); return <button type="button" key={recipe.id} onClick={() => old && switchRecipe(old.recipe_id, recipe, swapMeal)} className="rounded-2xl border border-border bg-surface p-4 text-left hover:border-brand"><span className="font-semibold">{recipe.name}</span><span className="mt-2 block text-xs text-muted-foreground">{zhCN.whyRecommended}：{reasons.map((reason) => reason === "临期食材优先" ? zhCN.freshnessPriority : reason === "库存刚好够" ? zhCN.inventoryEnough : zhCN.tasteMatched).join(" · ") || zhCN.inventoryEnough}</span></button>; })}{candidates(swapMeal).length === 0 && <p className="rounded-2xl bg-muted p-5 text-center text-sm text-muted-foreground">{zhCN.noSwapCandidates}</p>}</div></section></div>}
    {completionPlans && <CompletionDialog plans={completionPlans} stock={ingredients.data ?? []} busy={completionBusy} shortageMessage={completionError} onClose={() => { if (!completionBusy) { setCompletionPlans(null); setCompletionError(""); } }} onConfirm={(submission) => void completeSelection(submission)} />}
  </main>;
}
