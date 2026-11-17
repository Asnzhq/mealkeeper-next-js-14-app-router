"use client";

import Image from "next/image";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Minus, Plus, X } from "lucide-react";
import { zhCN } from "@/lib/i18n/zh-CN";

const gradients = [
  "from-brand/90 via-brand/50 to-avocado/70",
  "from-avocado/90 via-avocado/55 to-warning/60",
  "from-warning/80 via-brand/45 to-avocado/65",
  "from-brand/70 via-warning/55 to-muted",
];
function gradientFor(name: string): string {
  const hash = [...name].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return gradients[hash % gradients.length] ?? gradients[0]!;
}

export function RecipeVisual({ src, name, className = "" }: { src?: string | null; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const showImage = Boolean(src) && !failed;
  return <div className={`relative isolate overflow-hidden bg-muted ${className}`}>
    {showImage && <>
      {!loaded && <div aria-hidden="true" className="absolute inset-0 animate-pulse bg-muted" />}
      <Image unoptimized={src?.startsWith("http") ?? false} loading="lazy" src={src!} alt={name} fill sizes="(max-width: 768px) 100vw, 900px" className={`object-cover transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
    </>}
    {!showImage && <div className={`absolute inset-0 grid place-items-center bg-gradient-to-br ${gradientFor(name)}`}><div className="rounded-full border border-white/35 bg-surface/35 px-8 py-5 text-center text-4xl font-bold text-white shadow-soft backdrop-blur-sm">{name.slice(0, 1)}</div></div>}
  </div>;
}

export interface GalleryImage { src?: string | null; alt: string }
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
      {!loaded && !failed && <div className="absolute inset-0 animate-pulse bg-muted/30" aria-label={zhCN.loadingRecipeImage} />}
      {failed ? <div className="absolute inset-0"><RecipeVisual name={image.alt} className="h-full w-full" /></div> : <Image unoptimized={image.src?.startsWith("http") ?? false} loading="lazy" src={image.src || "/illustrations/recipe-placeholder.svg"} alt={image.alt} fill sizes="100vw" className="object-contain transition-transform duration-150" style={{ transform: `scale(${scale})`, touchAction: "none" }} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />}
    </div>
    <div onClick={(event) => event.stopPropagation()} className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-5 rounded-full bg-surface/15 px-4 py-2"><button type="button" aria-label={zhCN.zoomOut} onClick={() => setScale((value) => Math.max(1, value - 0.25))} className="p-2"><Minus size={18} /></button><span className="min-w-12 text-center text-sm tabular-nums">{Math.round(scale * 100)}%</span><button type="button" aria-label={zhCN.zoomIn} onClick={() => setScale((value) => Math.min(4, value + 0.25))} className="p-2"><Plus size={18} /></button>{images.length > 1 && <><span className="text-sm tabular-nums">{activeIndex + 1} / {images.length}</span><button type="button" aria-label={zhCN.nextImage} onClick={(event) => { event.stopPropagation(); next(); }} className="p-2"><ChevronRight size={20} /></button></>}</div>
  </motion.div></AnimatePresence>;
}
