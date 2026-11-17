import { zhCN } from "@/lib/i18n/zh-CN";
export default function Loading() { return <main aria-label={zhCN.loading} className="mx-auto max-w-3xl animate-pulse px-4 py-12"><div className="h-8 w-52 rounded bg-muted"/><div className="mt-5 h-12 rounded-xl bg-muted"/><div className="mt-5 h-96 rounded-3xl bg-muted"/></main>; }
