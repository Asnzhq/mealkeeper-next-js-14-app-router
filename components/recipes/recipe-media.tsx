"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Minus, Plus, UtensilsCrossed, X } from "lucide-react";
import { zhCN } from "@/lib/i18n/zh-CN";
import { recipePlaceholderGradient } from "@/lib/recipes/placeholder-gradient";

export function RecipePlaceholder({ name, className = "" }: { name: string; className?: string }) {
  const firstCharacter = Array.from(name.trim())[0] ?? "?";
  const gradient = recipePlaceholderGradient(name);
  return <div role="img" aria-label={`${name}，${zhCN.recipePlaceholderBadge}`} className={`relative isolate grid place-items-center overflow-hidden bg-muted ${className}`}>
    <div aria-hidden="true" className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
    <div aria-hidden="true" className="relative flex flex-col items-center gap-3 text-center text-brand-foreground drop-shadow-sm">
      <span className="text-5xl font-bold leading-none sm:text-6xl">{firstCharacter}</span>
      <UtensilsCrossed size={30} strokeWidth={1.8} />
    </div>
    <span className="absolute bottom-3 right-3 rounded-full bg-surface/90 px-2.5 py-1 text-xs font-semibold text-foreground shadow-card">{zhCN.recipePlaceholderBadge}</span>
  </div>;
}

export function RecipeVisual({ src, name, className = "" }: { src?: string | null; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const showImage = Boolean(src?.trim()) && !failed;

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src]);

  if (!showImage) return <RecipePlaceholder name={name} className={className} />;
  return <div className={`relative isolate overflow-hidden bg-muted ${className}`}>
    {!loaded && <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-muted" />}
    {/* eslint-disable-next-line @next/next/no-img-element -- Covers are loaded directly from storage. */}
    <img width={1200} height={800} loading="lazy" decoding="async" src={src!} alt={name} className={`h-full w-full object-cover transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
  </div>;
}

export interface GalleryImage { src?: string | null; alt: string; placeholderName?: string }
export function ImageLightbox({ images, activeIndex, onChange, onClose }: { images: GalleryImage[]; activeIndex: number; onChange: (index: number) => void; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [start, setStart] = useState<{ x: number; distance: number; scale: number } | null>(null);
  const image = images[activeIndex];
  const previous = () => { setScale(1); setFailed(false); setLoaded(false); onChange((activeIndex - 1 + images.length) % images.length); };
  const next = () => { setScale(1); setFailed(false); setLoaded(false); onChange((activeIndex + 1) % images.length); };
  const touchDistance = (touches: React.TouchList) => touches.length < 2 ? 0 : Math.hypot(touches[0]!.clientX - touches[1]!.clientX, touches[0]!.clientY - touches[1]!.clientY);
  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => setStart({ x: event.touches[0]?.clientX ?? 0, distance: touchDistance(event.touches), scale });
  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!start) return;
    if (start.distance > 0) { setStart(null); return; }
    const delta = (event.changedTouches[0]?.clientX ?? start.x) - start.x;
    if (Math.abs(delta) > 65) delta < 0 ? next() : previous();
    setStart(null);
  };
  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (start?.distance && event.touches.length > 1) {
      const ratio = touchDistance(event.touches) / start.distance;
      setScale(Math.max(1, Math.min(4, start.scale * ratio)));
    }
  };
  if (!image) return null;
  return <AnimatePresence><motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] flex items-center justify-center bg-foreground/95 p-3 text-background" role="dialog" aria-modal="true" aria-label={zhCN.imageViewer} onClick={onClose}>
    <button type="button" onClick={onClose} aria-label={zhCN.close} className="absolute right-4 top-4 z-10 rounded-full bg-surface/15 p-3 text-background"><X size={24} /></button>
    {images.length > 1 && <button type="button" aria-label={zhCN.previousImage} onClick={(event) => { event.stopPropagation(); previous(); }} className="absolute left-2 z-10 rounded-full bg-surface/15 p-3 text-background sm:left-6"><ChevronLeft size={28} /></button>}
    <div className="relative h-[82dvh] w-full max-w-6xl overflow-hidden" onClick={(event) => event.stopPropagation()} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      {!loaded && !failed && image.src && <div className="absolute inset-0 animate-pulse bg-muted/30" aria-label={zhCN.loadingRecipeImage} />}
      {!image.src || failed ? <RecipePlaceholder name={image.placeholderName ?? image.alt} className="h-full w-full" /> : <Image width={1600} height={1200} unoptimized={image.src.startsWith("http")} loading="lazy" src={image.src} alt={image.alt} sizes="100vw" className="h-full w-full object-contain transition-transform duration-150" style={{ transform: `scale(${scale})`, touchAction: "none" }} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />}
    </div>
    <div onClick={(event) => event.stopPropagation()} className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-5 rounded-full bg-surface/15 px-4 py-2"><button type="button" aria-label={zhCN.zoomOut} onClick={() => setScale((value) => Math.max(1, value - 0.25))} className="p-2"><Minus size={18} /></button><span className="min-w-12 text-center text-sm tabular-nums">{Math.round(scale * 100)}%</span><button type="button" aria-label={zhCN.zoomIn} onClick={() => setScale((value) => Math.min(4, value + 0.25))} className="p-2"><Plus size={18} /></button>{images.length > 1 && <><span className="text-sm tabular-nums">{activeIndex + 1} / {images.length}</span><button type="button" aria-label={zhCN.nextImage} onClick={(event) => { event.stopPropagation(); next(); }} className="p-2"><ChevronRight size={20} /></button></>}</div>
  </motion.div></AnimatePresence>;
}
