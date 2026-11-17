"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, ChartNoAxesCombined, ChefHat } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/app-shell";
import { zhCN } from "@/lib/i18n/zh-CN";

interface Statistics {
  days: number;
  empty: boolean;
  meal_cost_trend: Array<{ date: string; breakfast: number; lunch: number; dinner: number; total: number }>;
  consumption_top: Array<{ ingredient_id: string; name: string; unit: string; quantity: number; cost: number }>;
  recipe_popularity: Array<{ recipe_id: string; name: string; count: number }>;
  nutrition_trend: Array<{ date: string; calories: number; protein: number; carbs: number; fat: number }>;
  diversity: { ingredients: number; target: number; score: number };
}
interface Envelope<T> { code: number; data: T; message: string }
async function getStatistics(days: 7 | 30): Promise<Statistics> { const response = await fetch(`/api/stats?days=${days}`); const result = await response.json() as Envelope<Statistics>; if (!response.ok || result.code >= 400) throw new Error(result.message || zhCN.statisticsError); return result.data; }
const chartInk = "hsl(var(--muted-foreground))";
const tooltipStyle = { backgroundColor: "hsl(var(--surface))", borderColor: "hsl(var(--border))", color: "hsl(var(--foreground))", borderRadius: 12 };
const dayLabel = (value: string) => value.slice(5);

export function StatisticsClient() {
  const [days, setDays] = useState<7 | 30>(7);
  const stats = useQuery({ queryKey: ["statistics", days], queryFn: () => getStatistics(days) });
  const data = stats.data;
  return <AppShell><main id="main-content" className="mx-auto max-w-7xl px-4 pb-32 pt-7 sm:px-8 lg:px-10 lg:pb-12">
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3"><div><p className="mb-1 text-sm font-medium text-avocado">{zhCN.appName}</p><h1 className="text-3xl font-bold tracking-tight">{zhCN.statsTitle}</h1><p className="mt-2 text-sm text-muted-foreground">{zhCN.statsSubtitle}</p></div><div className="inline-flex rounded-full bg-muted p-1"><button type="button" aria-pressed={days === 7} onClick={() => setDays(7)} className={`rounded-full px-4 py-2 text-sm font-semibold ${days === 7 ? "bg-surface text-foreground shadow-card" : "text-muted-foreground"}`}>{zhCN.statsSevenDays}</button><button type="button" aria-pressed={days === 30} onClick={() => setDays(30)} className={`rounded-full px-4 py-2 text-sm font-semibold ${days === 30 ? "bg-surface text-foreground shadow-card" : "text-muted-foreground"}`}>{zhCN.statsThirtyDays}</button></div></header>
    {stats.isLoading ? <div aria-label={zhCN.chartLoading} className="grid gap-4 sm:grid-cols-2">{[0,1,2,3].map((item)=><div key={item} className="h-72 animate-pulse rounded-3xl bg-muted"/>)}</div> : stats.error ? <p role="alert" className="rounded-2xl bg-danger/10 p-4 text-sm text-danger">{(stats.error as Error).message}</p> : data?.empty ? <section className="mb-5 flex flex-col items-center rounded-3xl border border-border bg-surface px-6 py-10 text-center shadow-card"><div role="img" aria-label={zhCN.emptyIllustrationAlt} className="grid h-20 w-20 place-items-center rounded-full bg-avocado/10 text-4xl">🍲</div><h2 className="mt-4 text-xl font-bold">{zhCN.noStatsYet}</h2><p className="mt-2 max-w-lg text-sm text-muted-foreground">{zhCN.noStatsHint}</p><a href="/" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-white">{zhCN.goPlanToday}<ArrowRight size={16}/></a></section> : null}
    {data && <>
      {!data.empty && <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-avocado/20 bg-avocado/10 px-4 py-3"><span className="flex items-center gap-2 text-sm font-semibold"><Activity size={17} className="text-avocado"/>{zhCN.diversityTitle}</span><span className="text-sm"><strong className="font-mono text-xl tabular-nums">{data.diversity.ingredients}</strong> {zhCN.diversityUnit} / {data.diversity.target} · {data.diversity.score}%</span></section>}
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <ChartCard icon={<ChartNoAxesCombined size={18}/>} title={zhCN.mealCostTrend} subtitle={zhCN.costAxis} empty={data.meal_cost_trend.every((item)=>item.total===0)}>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={data.meal_cost_trend} margin={{ top: 8, right: 8, left: -18, bottom: 4 }}><CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3"/><XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fill: chartInk, fontSize: 11 }}/><YAxis tick={{ fill: chartInk, fontSize: 11 }}/><Tooltip contentStyle={tooltipStyle} labelFormatter={(value)=>String(value)}/><Legend/><Bar dataKey="breakfast" name={zhCN.mealBreakfast} stackId="meal" fill="hsl(var(--brand))" radius={[0,0,0,0]}/><Bar dataKey="lunch" name={zhCN.mealLunch} stackId="meal" fill="hsl(var(--avocado))"/><Bar dataKey="dinner" name={zhCN.mealDinner} stackId="meal" fill="hsl(var(--warning))" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard icon={<ShoppingBasketIcon/>} title={zhCN.consumptionTop} subtitle={zhCN.ingredientAmount} empty={!data.consumption_top.length}>
          <ResponsiveContainer width="100%" height="100%"><BarChart data={data.consumption_top} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}><CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3"/><XAxis type="number" tick={{ fill: chartInk, fontSize: 11 }}/><YAxis type="category" dataKey="name" width={58} tick={{ fill: chartInk, fontSize: 11 }}/><Tooltip contentStyle={tooltipStyle} formatter={(value, _name, item)=>[`${value} ${item.payload.unit}`, zhCN.ingredientAmount]}/><Bar dataKey="quantity" name={zhCN.ingredientAmount} fill="hsl(var(--brand))" radius={[0,6,6,0]}/></BarChart></ResponsiveContainer>
        </ChartCard>
        <ChartCard icon={<ChefHat size={18}/>} title={zhCN.recipePopularity} subtitle={days === 7 ? zhCN.statsSevenDays : zhCN.statsThirtyDays} empty={!data.recipe_popularity.length}>
          <ul className="space-y-2 overflow-y-auto">{data.recipe_popularity.map((item,index)=><li key={item.recipe_id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-3 py-2.5"><span className="min-w-0 truncate font-medium"><span className="mr-2 font-mono text-xs text-muted-foreground">{index+1}</span>{item.name}</span><span className="shrink-0 rounded-full bg-surface px-2.5 py-1 text-xs font-semibold tabular-nums">{item.count} {zhCN.mealsPlanned}</span></li>)}</ul>
        </ChartCard>
        <ChartCard icon={<Activity size={18}/>} title={zhCN.nutritionTrend} subtitle={zhCN.nutritionAxis} empty={data.nutrition_trend.every((item)=>item.calories+item.protein+item.carbs+item.fat===0)}>
          <ResponsiveContainer width="100%" height="100%"><LineChart data={data.nutrition_trend} margin={{ top: 8, right: 8, left: -18, bottom: 4 }}><CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3"/><XAxis dataKey="date" tickFormatter={dayLabel} tick={{ fill: chartInk, fontSize: 11 }}/><YAxis yAxisId="calories" tick={{ fill: chartInk, fontSize: 11 }}/><YAxis yAxisId="macros" orientation="right" tick={{ fill: chartInk, fontSize: 11 }}/><Tooltip contentStyle={tooltipStyle}/><Legend/><Line yAxisId="calories" type="monotone" dataKey="calories" name={zhCN.caloriesLabel} stroke="hsl(var(--brand))" strokeWidth={2.5} dot={false}/><Line yAxisId="macros" type="monotone" dataKey="protein" name={zhCN.proteinLabel} stroke="hsl(var(--avocado))" strokeWidth={2} dot={false}/><Line yAxisId="macros" type="monotone" dataKey="carbs" name={zhCN.carbsLabel} stroke="hsl(var(--warning))" strokeWidth={2} dot={false}/><Line yAxisId="macros" type="monotone" dataKey="fat" name={zhCN.fatLabel} stroke="hsl(var(--danger))" strokeWidth={2} dot={false}/></LineChart></ResponsiveContainer>
        </ChartCard>
      </div>
      {!data.empty && <section className="mt-4 rounded-3xl border border-border bg-surface p-5 shadow-card"><h2 className="font-bold">{zhCN.diversityTitle}</h2><div className="mt-4 grid items-center gap-4 sm:grid-cols-[180px_1fr]"><div className="h-40"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={[{name:zhCN.diversityTitle,value:data.diversity.score},{name:zhCN.diversityTarget,value:100-data.diversity.score}]} dataKey="value" innerRadius={44} outerRadius={68} paddingAngle={3}><Cell fill="hsl(var(--avocado))"/><Cell fill="hsl(var(--muted))"/></Pie><Tooltip contentStyle={tooltipStyle}/></PieChart></ResponsiveContainer></div><div><p className="font-mono text-3xl font-bold tabular-nums">{data.diversity.score}%</p><p className="mt-1 text-sm text-muted-foreground">{zhCN.diversityDescription}：{data.diversity.ingredients} {zhCN.diversityUnit} / {data.diversity.target} {zhCN.diversityUnit}</p></div></div></section>}
    </>}
  </main></AppShell>;
}

function ShoppingBasketIcon() { return <span className="text-brand">🧺</span>; }
function ChartCard({ icon, title, subtitle, empty, children }: { icon: ReactNode; title: string; subtitle: string; empty: boolean; children: ReactNode }) {
  return <section className="min-w-0 rounded-3xl border border-border bg-surface p-4 shadow-card sm:p-5"><div className="mb-3 flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-brand/10 text-brand">{icon}</span><div className="min-w-0"><h2 className="truncate font-bold">{title}</h2><p className="text-xs text-muted-foreground">{subtitle}</p></div></div>{empty ? <div className="grid h-56 place-items-center rounded-2xl bg-muted/50 text-sm text-muted-foreground">{zhCN.chartEmpty}</div> : <div className="h-56 w-full sm:h-72">{children}</div>}</section>;
}
