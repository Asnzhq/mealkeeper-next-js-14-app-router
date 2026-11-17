"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { zhCN } from "@/lib/i18n/zh-CN";

type Mode = "email" | "phone";
export function LoginClient() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("email");
  const [registering, setRegistering] = useState(false);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [phone, setPhone] = useState(""); const [code, setCode] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const sendCode = async () => { const response = await fetch("/api/auth/phone-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) }); const data = await response.json() as { message: string; data?: { development_code?: string } }; setMessage(data.data?.development_code ? `${data.message} ${zhCN.verificationCode}：${data.data.development_code}` : data.message); };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      if (registering) {
        const response = mode === "email"
          ? await fetch("/api/account", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, password }) })
          : await fetch("/api/account/phone", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, phone, code }) });
        const result = await response.json() as { code: number; message: string };
        if (!response.ok) throw new Error(result.message);
        setRegistering(false); setMessage(zhCN.registrationSuccess);
        return;
      }
      const result = await signIn("credentials", { redirect: false, mode, email, password, phone, code });
      if (!result?.ok) throw new Error(zhCN.accountLoginError);
      router.push("/family"); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : zhCN.registrationError); }
    finally { setBusy(false); }
  };
  return <main className="mx-auto grid min-h-[calc(100vh-72px)] max-w-lg place-items-center px-4 py-10"><form onSubmit={submit} className="w-full rounded-3xl border border-border bg-surface p-6 shadow-card sm:p-8"><p className="text-sm font-semibold text-avocado">MealKeeper</p><h1 className="mt-2 text-2xl font-bold">{registering ? zhCN.register : zhCN.login}</h1><div className="mt-5 grid grid-cols-2 rounded-xl bg-muted p-1"><button type="button" onClick={() => setMode("email")} className={`rounded-lg py-2 text-sm font-semibold ${mode === "email" ? "bg-surface shadow-card" : "text-muted-foreground"}`}>{zhCN.emailLogin}</button><button type="button" onClick={() => setMode("phone")} className={`rounded-lg py-2 text-sm font-semibold ${mode === "phone" ? "bg-surface shadow-card" : "text-muted-foreground"}`}>{zhCN.phoneLogin}</button></div><div className="mt-5 grid gap-4">{registering && <label className="grid gap-1.5 text-sm font-medium">{zhCN.displayName}<input required value={name} onChange={(e) => setName(e.target.value)} className="field" autoComplete="name"/></label>}{mode === "email" ? <><label className="grid gap-1.5 text-sm font-medium">{zhCN.emailAddress}<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="field" autoComplete="email"/></label><label className="grid gap-1.5 text-sm font-medium">{zhCN.password}<input type="password" minLength={10} required={registering} value={password} onChange={(e) => setPassword(e.target.value)} className="field" autoComplete={registering ? "new-password" : "current-password"}/>{registering && <span className="text-xs text-muted-foreground">{zhCN.passwordHint}</span>}</label></> : <><label className="grid gap-1.5 text-sm font-medium">{zhCN.phoneNumber}<input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} className="field" autoComplete="tel"/></label><div className="grid grid-cols-[1fr_auto] items-end gap-2"><label className="grid gap-1.5 text-sm font-medium">{zhCN.verificationCode}<input required value={code} onChange={(e) => setCode(e.target.value)} className="field" inputMode="numeric"/></label><button type="button" onClick={() => void sendCode()} className="min-h-11 rounded-xl border border-border px-3 text-xs font-semibold">{zhCN.sendVerificationCode}</button></div></>}</div>{message && <p role="status" className="mt-4 rounded-xl bg-muted p-3 text-sm">{message}</p>}<button disabled={busy} className="mt-5 w-full rounded-2xl bg-brand px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? zhCN.loading : registering ? zhCN.register : zhCN.login}</button><button type="button" onClick={() => { setRegistering((value) => !value); setMessage(""); }} className="mt-4 w-full py-2 text-sm font-semibold text-brand">{registering ? zhCN.login : zhCN.register}</button></form></main>;
}
