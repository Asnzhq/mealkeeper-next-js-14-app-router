import { AppShell } from "@/components/app-shell";
import { zhCN } from "@/lib/i18n/zh-CN";

export default function ShoppingLoading() {
  return <AppShell><main className="mx-auto max-w-5xl px-4 pb-28 pt-7 sm:px-8 lg:px-10" aria-label={zhCN.loading}><div className="h-9 w-64 animate-pulse rounded-lg bg-muted" /><div className="mt-6 h-32 animate-pulse rounded-3xl bg-muted" />{[0, 1, 2].map((item) => <div key={item} className="mt-3 h-20 animate-pulse rounded-2xl bg-muted" />)}</main></AppShell>;
}
