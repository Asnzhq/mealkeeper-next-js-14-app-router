import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { RecipeVisual } from "@/components/recipes/recipe-media";
import { prisma } from "@/server/db";
import { zhCN } from "@/lib/i18n/zh-CN";

export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const recipes = await prisma.recipe.findMany({ where: { review_status: "approved" }, orderBy: { name: "asc" } });
  return <AppShell><main id="main-content" className="mx-auto max-w-7xl px-4 pb-28 pt-8 sm:px-8 lg:px-10 lg:pb-12"><header className="mb-7"><h1 className="text-3xl font-bold sm:text-4xl">{zhCN.recipesTitle}</h1><p className="mt-2 text-muted-foreground">{zhCN.recipesSubtitle}</p></header>{recipes.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{recipes.map((recipe) => <Link key={recipe.id} href={`/recipes/${recipe.id}`} className="overflow-hidden rounded-3xl border border-border bg-surface shadow-card transition hover:-translate-y-0.5 hover:shadow-soft"><RecipeVisual src={recipe.imageUrl} name={recipe.name} className="h-48 w-full" /><div className="p-5"><h2 className="text-lg font-bold">{recipe.name}</h2><p className="mt-2 text-sm text-muted-foreground">{recipe.duration_min} {zhCN.minuteShort}</p></div></Link>)}</div> : <section className="rounded-3xl border border-border bg-surface px-6 py-14 text-center"><div className="mx-auto h-44 max-w-xs animate-pulse rounded-2xl bg-muted" aria-hidden="true" /><h2 className="mt-5 text-lg font-semibold">{zhCN.noRecipes}</h2></section>}</main></AppShell>;
}
