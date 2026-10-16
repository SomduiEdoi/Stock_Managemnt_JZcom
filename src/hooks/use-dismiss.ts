"use client";

import { useEffect, useRef, type RefObject } from "react";

export function useDismiss(open: boolean, onClose: () => void, refs: RefObject<HTMLElement | null>[]) {
  const latest = useRef({ onClose, refs });
  useEffect(() => { latest.current = { onClose, refs }; });
  useEffect(() => {
    if (!open) return;
    function pointer(event: PointerEvent) {
      if (!latest.current.refs.some((ref) => ref.current?.contains(event.target as Node))) latest.current.onClose();
    }
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") latest.current.onClose();
    }
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", pointer);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
}
