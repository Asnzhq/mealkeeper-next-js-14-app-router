import { AppShell } from "@/components/app-shell";
import { zhCN } from "@/lib/i18n/zh-CN";
export default function RecipesLoading() { return <AppShell><main className="mx-auto max-w-7xl px-4 py-8"><h1 className="sr-only">{zhCN.recipesTitle}</h1><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0,1,2].map((item) => <div key={item} className="h-64 animate-pulse rounded-3xl bg-muted" />)}</div></main></AppShell>; }
