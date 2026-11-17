"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { zhCN } from "@/lib/i18n/zh-CN";

export function DataToolsClient() {
  const account = useQuery({ queryKey: ["account"], queryFn: async () => { const response = await fetch("/api/account"); if (!response.ok) throw new Error(zhCN.loginRequired); return response.json(); } });
  const [kind, setKind] = useState("ingredients");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const download = async (type: string, name: string) => {
    const response = await fetch(`/api/data/export?type=${type}`);
    if (!response.ok) { setNotice(zhCN.importFailure); return; }
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
  };
  const importFile = async () => {
    if (!file) return;
    setBusy(true); setNotice("");
    try { const form = new FormData(); form.set("file", file); form.set("kind", kind); const response = await fetch("/api/data/import", { method: "POST", body: form }); const result = await response.json() as { code: number; message: string }; if (!response.ok) throw new Error(result.message); setNotice(zhCN.importSuccess); setFile(null); }
    catch { setNotice(zhCN.importFailure); } finally { setBusy(false); }
  };
  const clearDemo = async () => {
    if (!window.confirm(zhCN.clearDemoConfirm)) return;
    const response = await fetch("/api/data/demo", { method: "DELETE" }); setNotice(response.ok ? zhCN.clearDemoSuccess : zhCN.importFailure);
  };
  if (account.isLoading) return <main className="mx-auto max-w-3xl animate-pulse px-4 py-10"><div className="h-8 w-48 rounded bg-muted"/><div className="mt-6 h-56 rounded-3xl bg-muted"/></main>;
  if (account.error) return <main className="mx-auto max-w-3xl px-4 py-12 text-center"><p>{zhCN.loginRequired}</p><a href="/login" className="mt-4 inline-flex rounded-xl bg-brand px-5 py-3 font-semibold text-white">{zhCN.login}</a></main>;
  return <main className="mx-auto max-w-3xl px-4 pb-32 pt-8 sm:px-8"><a href="/profile" className="text-sm font-semibold text-brand">← {zhCN.profile}</a><h1 className="mt-3 text-3xl font-bold">{zhCN.dataTools}</h1><p className="mt-2 text-sm text-muted-foreground">{zhCN.dataToolsHint}</p>
    <section className="mt-6 rounded-3xl border border-border bg-surface p-5 shadow-card"><h2 className="text-lg font-bold">{zhCN.exportData}</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><button onClick={() => void download("json", "mealkeeper-backup.json")} className="rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white">{zhCN.exportJson}</button><button onClick={() => void download("ingredients", "ingredients.csv")} className="rounded-xl border border-border px-4 py-3 text-sm font-semibold">{zhCN.exportIngredientsCsv}</button><button onClick={() => void download("logs", "inventory-logs.csv")} className="rounded-xl border border-border px-4 py-3 text-sm font-semibold">{zhCN.exportLogsCsv}</button><button onClick={() => void download("plans", "plans.csv")} className="rounded-xl border border-border px-4 py-3 text-sm font-semibold">{zhCN.exportPlansCsv}</button></div></section>
    <section className="mt-5 rounded-3xl border border-border bg-surface p-5 shadow-card"><h2 className="text-lg font-bold">{zhCN.importData}</h2><label className="mt-4 grid gap-2 text-sm font-medium">{zhCN.csvKind}<select value={kind} onChange={(event) => setKind(event.target.value)} className="rounded-xl border border-border bg-background px-3 py-3"><option value="ingredients">{zhCN.ingredients}</option><option value="logs">{zhCN.activityLogTitle}</option><option value="plans">{zhCN.mealPlan}</option></select></label><label className="mt-3 grid gap-2 text-sm font-medium">{zhCN.selectBackup}<input type="file" accept=".json,.csv,application/json,text/csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="rounded-xl border border-border bg-background px-3 py-3"/></label><button disabled={!file || busy} onClick={() => void importFile()} className="mt-4 w-full rounded-xl bg-brand px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? zhCN.importBusy : zhCN.importData}</button></section>
    <section className="mt-5 rounded-3xl border border-danger/30 bg-surface p-5"><h2 className="text-lg font-bold">{zhCN.clearDemo}</h2><p className="mt-2 text-sm text-muted-foreground">{zhCN.clearDemoDescription}</p><button onClick={() => void clearDemo()} className="mt-4 rounded-xl border border-danger/40 px-4 py-3 text-sm font-semibold text-danger">{zhCN.clearDemo}</button></section>{notice && <p role="status" className="mt-4 text-center text-sm font-semibold text-avocado">{notice}</p>}</main>;
}
