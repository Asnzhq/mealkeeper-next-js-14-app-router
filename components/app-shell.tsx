"use client";
import { CalendarDays, ChartNoAxesCombined, ChefHat, CircleUserRound, House, Leaf, ListChecks } from "lucide-react";
import { usePathname } from "next/navigation";
import { zhCN } from "@/lib/i18n/zh-CN";

const navigation = [
  { label: zhCN.today, icon: House, href: "/" },
  { label: zhCN.ingredients, icon: Leaf, href: "/ingredients" },
  { label: zhCN.recipes, icon: ChefHat, href: "/recipes" },
  { label: zhCN.shopping, icon: ListChecks, href: "/shopping" },
  { label: zhCN.profile, icon: CircleUserRound, href: "/profile" },
];
function Brand() { return <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-brand-foreground"><CalendarDays size={21} aria-hidden="true" /></span><span className="text-lg font-bold tracking-tight">{zhCN.appName}</span></div>; }
export function AppShell({ children }: { children: React.ReactNode }) {
 const pathname=usePathname();
 return <div className="min-h-screen bg-background text-foreground lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
  <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-3">{zhCN.skipLink}</a>
  <aside className="hidden border-r border-border bg-surface px-5 py-7 lg:flex lg:flex-col"><Brand/><nav aria-label={zhCN.mainNavigation} className="mt-12 space-y-2">{navigation.map(item=>{const Icon=item.icon;const active=pathname===item.href||(item.href!=="/"&&pathname.startsWith(item.href));return <a key={item.href} href={item.href} aria-current={active?"page":undefined} className={`flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-medium transition-colors ${active?"bg-brand text-brand-foreground":"text-muted-foreground hover:bg-muted hover:text-foreground"}`}><Icon size={19} aria-hidden="true"/>{item.label}</a>})}</nav><div className="mt-auto rounded-2xl bg-muted p-4"><p className="text-sm font-semibold">{zhCN.weekOverview}</p><p className="mt-2 text-sm text-muted-foreground">{zhCN.mealsPlanned}</p><p className="mt-1 text-lg font-bold">{zhCN.mealsCount}</p></div></aside>
  <div className="min-w-0"><header className="flex h-[72px] items-center justify-between border-b border-border bg-surface px-5 sm:px-8 lg:px-10"><div className="lg:hidden"><Brand/></div><div className="hidden text-sm text-muted-foreground lg:block">{zhCN.dateLabel}</div><div className="ml-auto flex items-center gap-3"><a href="/stats" aria-label={zhCN.viewStatistics} className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"><ChartNoAxesCombined size={18}/><span className="hidden sm:inline">{zhCN.viewStatistics}</span></a><a href="/profile" aria-label={zhCN.profile} className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground hover:text-brand"><CircleUserRound size={20}/></a></div></header>{children}<nav aria-label={zhCN.mainNavigation} className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-surface/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur lg:hidden">{navigation.map(item=>{const Icon=item.icon;const active=pathname===item.href||(item.href!=="/"&&pathname.startsWith(item.href));return <a key={item.href} href={item.href} aria-current={active?"page":undefined} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium ${active?"text-brand":"text-muted-foreground"}`}><Icon size={20} aria-hidden="true"/><span>{item.label}</span></a>})}</nav></div>
 </div>
}
