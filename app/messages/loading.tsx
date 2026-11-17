import { zhCN } from "@/lib/i18n/zh-CN";
export default function Loading() { return <main aria-label={zhCN.loading} className="mx-auto max-w-2xl animate-pulse px-4 py-12"><div className="h-8 w-44 rounded bg-muted"/><div className="mt-6 h-72 rounded-3xl bg-muted"/></main>; }
