import { zhCN } from "@/lib/i18n/zh-CN";

export default function OfflinePage() {
  return <main className="grid min-h-screen place-items-center px-6"><section className="max-w-md text-center"><h1 className="text-3xl font-bold">{zhCN.offlineTitle}</h1><p className="mt-3 text-muted-foreground">{zhCN.offlineDescription}</p><a href="/" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 font-semibold text-brand-foreground">{zhCN.returnHome}</a></section></main>;
}

