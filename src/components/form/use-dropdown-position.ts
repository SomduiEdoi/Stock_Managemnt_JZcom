"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import { dropdownPosition } from "./dropdown-position";

export function useDropdownPosition(open: boolean, trigger: RefObject<HTMLElement | null>, menu: RefObject<HTMLElement | null>) {
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 240 });
  useLayoutEffect(() => {
    if (!open) return;
    function update() {
      if (!trigger.current || !menu.current) return;
      const viewport = window.visualViewport;
      const next = dropdownPosition(trigger.current.getBoundingClientRect(), menu.current.scrollHeight + 2, {
        width: viewport?.width ?? window.innerWidth,
        height: viewport?.height ?? window.innerHeight,
        left: viewport?.offsetLeft ?? 0,
        top: viewport?.offsetTop ?? 0,
      });
      setPosition((current) => Object.keys(next).every((key) => current[key as keyof typeof next] === next[key as keyof typeof next]) ? current : next);
    }
    update();
    const observer = new ResizeObserver(update);
    if (trigger.current) observer.observe(trigger.current);
    if (menu.current) observer.observe(menu.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [open, trigger, menu]);
  return position;
}
