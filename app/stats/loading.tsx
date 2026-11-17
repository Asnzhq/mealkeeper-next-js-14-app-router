import { AppShell } from "@/components/app-shell";
import { zhCN } from "@/lib/i18n/zh-CN";

export default function StatisticsLoading() {
  return <AppShell><main className="mx-auto max-w-7xl px-4 pb-28 pt-7 sm:px-8 lg:px-10" aria-label={zhCN.chartLoading}><div className="h-9 w-64 animate-pulse rounded-lg bg-muted"/><div className="mt-6 grid gap-4 sm:grid-cols-2">{[0,1,2,3].map((item)=><div key={item} className="h-72 animate-pulse rounded-3xl bg-muted"/>)}</div></main></AppShell>;
}
