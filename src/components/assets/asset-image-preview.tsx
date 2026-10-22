"use client";
import Image from "next/image";
import { ImageOff, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function AssetImagePreview({ src, alt, className = "h-12 w-12", sizes = "48px" }: { src?: string | null; alt: string; className?: string; sizes?: string }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { setFailed(false); }, [src]);
  useEffect(() => {
    if (!open) return;
    dialog.current?.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);
  if (!src || failed) return <div className={`flex items-center justify-center rounded-md border border-border bg-surface text-muted-foreground ${className}`} role="img" aria-label={`No image for ${alt}`}><ImageOff className="h-6 w-6" /></div>;
  return <>
    <button type="button" aria-label={`Enlarge image of ${alt}`} title="View full-size image" onClick={(event) => { event.stopPropagation(); setOpen(true); }} onKeyDown={(event) => event.stopPropagation()} className={`relative block cursor-pointer overflow-hidden rounded-md border border-border bg-white transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent ${className}`}>
      <Image src={src} alt={alt} fill sizes={sizes} unoptimized className="object-cover" onError={() => setFailed(true)} />
    </button>
    {open ? createPortal(<dialog ref={dialog} aria-label={`Full-size image of ${alt}`} className="fixed inset-0 m-auto h-[90dvh] max-h-[90dvh] w-[94vw] max-w-[94vw] overflow-visible border-0 bg-transparent p-0 backdrop:bg-black/80" onCancel={(event) => { event.preventDefault(); setOpen(false); }} onClick={(event) => { event.stopPropagation(); if (event.target === event.currentTarget) setOpen(false); }} onKeyDown={(event) => event.stopPropagation()}>
      <div className="pointer-events-none flex h-full w-full items-center justify-center">
        {/* Use the original image dimensions so only the visible image intercepts backdrop clicks. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="pointer-events-auto max-h-full max-w-full object-contain" />
      </div>
      <button type="button" aria-label="Close image preview" title="Close" autoFocus onClick={(event) => { event.stopPropagation(); setOpen(false); }} className="absolute right-2 top-2 z-10 flex h-10 w-10 items-center justify-center rounded-md bg-black/70 text-white hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"><X className="h-6 w-6" /></button>
    </dialog>, document.body) : null}
  </>;
}
