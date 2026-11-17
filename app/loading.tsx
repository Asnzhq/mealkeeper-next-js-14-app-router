import { zhCN } from "@/lib/i18n/zh-CN";

export default function Loading() {
  return <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:px-10" aria-label={zhCN.loading} aria-busy="true"><div className="h-8 w-48 animate-pulse rounded-lg bg-muted" /><div className="mt-3 h-5 w-64 animate-pulse rounded bg-muted" /><div className="mt-8 grid gap-5 md:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-56 animate-pulse rounded-2xl bg-muted" />)}</div></main>;
}

