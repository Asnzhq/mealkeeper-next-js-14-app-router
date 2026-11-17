import { AppShell } from "@/components/app-shell";
import { zhCN } from "@/lib/i18n/zh-CN";
export default function RecipeLoading() { return <AppShell><main className="mx-auto max-w-5xl px-4 py-6"><p className="sr-only">{zhCN.loadingRecipe}</p><div className="h-8 w-48 animate-pulse rounded-lg bg-muted" /><div className="mt-5 h-64 animate-pulse rounded-3xl bg-muted sm:h-80" /><div className="mt-6 h-40 animate-pulse rounded-3xl bg-muted" /></main></AppShell>; }
