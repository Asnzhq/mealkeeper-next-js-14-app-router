"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Clock3, Mic, Pause, Play, RotateCcw, X } from "lucide-react";
import { zhCN } from "@/lib/i18n/zh-CN";
import { ImageLightbox, RecipeVisual, type GalleryImage } from "@/components/recipes/recipe-media";

export interface CookingStep { title: string; instruction: string; image_url?: string | null }
interface RecognitionResultLike { 0?: { transcript?: string } }
interface RecognitionEventLike extends Event { results: ArrayLike<RecognitionResultLike> }
interface RecognitionLike { lang: string; continuous: boolean; onresult: ((event: RecognitionEventLike) => void) | null; onerror: (() => void) | null; start(): void; stop(): void }
interface WakeLockLike { release(): Promise<void> }
type SpeechWindow = Window & { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };

function timerMinutes(step: CookingStep): number {
  const text = `${step.title} ${step.instruction}`;
  const match = text.match(/(?:焖|炖|蒸|煮|烤|静置|等待|腌制)[^。\n]{0,15}?(\d{1,3})\s*(?:分钟|分)/);
  return match ? Number(match[1]) : 0;
}
function formatTime(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function CookingMode({ name, imageUrl, steps, onExit }: { name: string; imageUrl?: string | null; steps: CookingStep[]; onExit: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerDone, setTimerDone] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [wakeLockSupported, setWakeLockSupported] = useState(false);
  const recognition = useRef<RecognitionLike | null>(null);
  const wakeLock = useRef<WakeLockLike | null>(null);
  const currentStep = steps[stepIndex];
  const images: GalleryImage[] = steps.map((step, index) => ({ src: step.image_url || imageUrl, alt: `${name}，${zhCN.stepLabel}${index + 1}` }));

  const previous = useCallback(() => setStepIndex((index) => Math.max(0, index - 1)), []);
  const next = useCallback(() => setStepIndex((index) => Math.min(steps.length - 1, index + 1)), [steps.length]);
  const exit = useCallback(() => setShowExitConfirm(true), []);

  useEffect(() => {
    const speechWindow = window as SpeechWindow;
    const Constructor = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Constructor) return;
    const instance = new Constructor();
    instance.lang = "zh-CN";
    instance.continuous = true;
    instance.onresult = (event) => {
      const transcript = (event.results[event.results.length - 1]?.[0]?.transcript ?? "").replace(/\s/g, "");
      if (transcript.includes("下一步") || transcript.includes("下一道")) next();
      if (transcript.includes("上一步") || transcript.includes("上一步骤")) previous();
      if (transcript.includes("退出烹饪")) exit();
    };
    instance.onerror = () => setIsListening(false);
    recognition.current = instance;
    setSpeechSupported(true);
    return () => { instance.stop(); recognition.current = null; };
  }, [exit, next, previous]);

  useEffect(() => {
    const targetMinutes = currentStep ? timerMinutes(currentStep) : 0;
    setSecondsLeft(targetMinutes * 60);
    setTimerRunning(targetMinutes > 0);
    setTimerDone(false);
  }, [stepIndex, currentStep]);

  const alertTimer = useCallback(() => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([250, 150, 250]);
    try {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.value = 0.08;
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(); oscillator.stop(context.currentTime + 0.45);
      oscillator.onended = () => void context.close();
    } catch { /* Audio may be unavailable or blocked by the browser. */ }
    setTimerDone(true);
  }, []);

  useEffect(() => {
    if (!timerRunning || secondsLeft <= 0) return;
    const timeout = window.setTimeout(() => {
      if (secondsLeft <= 1) { setSecondsLeft(0); setTimerRunning(false); alertTimer(); }
      else setSecondsLeft((value) => value - 1);
    }, 1000);
    return () => window.clearTimeout(timeout);
  }, [alertTimer, secondsLeft, timerRunning]);

  useEffect(() => {
    let active = true;
    const navigatorWithWakeLock = navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<WakeLockLike> } };
    if (!navigatorWithWakeLock.wakeLock) return;
    setWakeLockSupported(true);
    void navigatorWithWakeLock.wakeLock.request("screen").then((lock) => { if (active) wakeLock.current = lock; else void lock.release(); }).catch(() => setWakeLockSupported(false));
    return () => { active = false; if (wakeLock.current) void wakeLock.current.release().catch(() => undefined); };
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") next();
      if (event.key === "ArrowLeft") previous();
      if (event.key === "Escape") exit();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [exit, next, previous]);

  const toggleSpeech = () => {
    if (!recognition.current) return;
    if (isListening) { recognition.current.stop(); setIsListening(false); }
    else { recognition.current.start(); setIsListening(true); }
  };
  if (!currentStep) return null;
  return <div className="fixed inset-0 z-[70] flex flex-col bg-background text-foreground" role="dialog" aria-modal="true" aria-label={zhCN.cookingMode}>
    <header className="flex shrink-0 items-center gap-4 border-b border-border px-4 py-3 sm:px-7"><button type="button" onClick={exit} aria-label={zhCN.exitCooking} className="rounded-xl bg-muted p-3"><X size={24} /></button><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><h1 className="truncate text-lg font-bold sm:text-xl">{name}</h1><span className="shrink-0 font-mono text-lg font-semibold tabular-nums sm:text-xl">{stepIndex + 1} / {steps.length}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand transition-all" style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} /></div></div></header>
    <p className="shrink-0 px-4 pt-2 text-center text-xs text-muted-foreground landscape:hidden">{zhCN.rotateHint}</p>
    <main className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-3 p-3 sm:p-5 landscape:grid-cols-2 landscape:grid-rows-1 landscape:gap-6 landscape:px-8 landscape:py-4">
      <button type="button" onClick={() => setLightboxOpen(true)} aria-label={zhCN.enlargeStepImage} className="relative min-h-36 overflow-hidden rounded-2xl bg-muted text-left landscape:h-full"><RecipeVisual src={currentStep.image_url || imageUrl} name={name} className="h-full w-full" /><div className="absolute bottom-3 right-3 rounded-full bg-foreground/50 px-3 py-1 text-xs text-background">{zhCN.enlargeStepImage}</div></button>
      <section className="flex min-h-0 flex-col justify-center overflow-y-auto px-2 py-1 landscape:px-1"><p className="mb-3 text-sm font-semibold uppercase tracking-wide text-brand">{zhCN.stepLabel} {stepIndex + 1}</p><h2 className="text-3xl font-bold leading-relaxed sm:text-4xl lg:text-5xl">{currentStep.title}</h2><p className="mt-3 text-3xl leading-relaxed sm:text-4xl lg:text-5xl">{currentStep.instruction}</p>
        {secondsLeft > 0 && <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl bg-muted px-4 py-3"><Clock3 size={24} className="text-brand" /><span className="font-mono text-3xl font-bold tabular-nums sm:text-4xl">{formatTime(secondsLeft)}</span><button type="button" onClick={() => setTimerRunning((running) => !running)} className="rounded-xl bg-surface px-4 py-2 text-base font-semibold">{timerRunning ? <Pause size={19} /> : <Play size={19} />}</button><button type="button" onClick={() => { setSecondsLeft(timerMinutes(currentStep) * 60); setTimerRunning(true); setTimerDone(false); }} aria-label={zhCN.restartTimer} className="rounded-xl bg-surface p-2"><RotateCcw size={19} /></button></div>}
        {timerDone && <p role="status" className="mt-4 rounded-xl bg-avocado/10 px-4 py-3 text-lg font-semibold text-avocado">{zhCN.timerFinished}</p>}
      </section>
    </main>
    <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-surface px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 sm:px-7"><div className="flex items-center gap-2">{speechSupported && <button type="button" onClick={toggleSpeech} aria-pressed={isListening} className={`flex min-h-14 items-center gap-2 rounded-2xl px-4 text-base font-semibold ${isListening ? "bg-brand text-brand-foreground" : "bg-muted"}`}><Mic size={20} />{isListening ? zhCN.voiceListening : zhCN.voiceControl}</button>}{wakeLockSupported && <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex"><Check size={15} />{zhCN.screenAwake}</span>}</div><div className="flex gap-2"><button type="button" disabled={stepIndex === 0} onClick={previous} className="flex min-h-14 items-center gap-2 rounded-2xl bg-muted px-4 text-lg font-bold disabled:opacity-40 sm:px-6"><ChevronLeft size={24} />{zhCN.previousStep}</button><button type="button" disabled={stepIndex >= steps.length - 1} onClick={next} className="flex min-h-14 items-center gap-2 rounded-2xl bg-brand px-4 text-lg font-bold text-brand-foreground disabled:opacity-40 sm:px-6">{zhCN.nextStep}<ChevronRight size={24} /></button></div></footer>
    {lightboxOpen && <ImageLightbox images={images} activeIndex={stepIndex} onChange={setStepIndex} onClose={() => setLightboxOpen(false)} />}
    {showExitConfirm && <div className="fixed inset-0 z-[90] grid place-items-center bg-foreground/50 p-5"><section role="alertdialog" aria-modal="true" aria-labelledby="exit-title" className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-soft"><h2 id="exit-title" className="text-xl font-bold">{zhCN.confirmExitCooking}</h2><p className="mt-2 text-sm text-muted-foreground">{zhCN.exitCookingHint}</p><div className="mt-5 flex gap-3"><button type="button" onClick={() => setShowExitConfirm(false)} className="flex-1 rounded-xl bg-muted px-4 py-3 font-semibold">{zhCN.keepCooking}</button><button type="button" onClick={onExit} className="flex-1 rounded-xl bg-brand px-4 py-3 font-semibold text-brand-foreground">{zhCN.exitCooking}</button></div></section></div>}
  </div>;
}
