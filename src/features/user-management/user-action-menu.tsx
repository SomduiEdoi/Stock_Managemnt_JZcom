"use client";

import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Ban,
  EllipsisVertical,
  SquarePen,
  Trash2,
  UnlockKeyhole,
} from "lucide-react";

type UserActionMenuProps = {
  isActive: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onToggleBlock: () => void;
  userName: string;
};

export function UserActionMenu({
  isActive,
  onDelete,
  onEdit,
  onToggleBlock,
  userName,
}: UserActionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const portalMenuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !portalMenuRef.current?.contains(target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const width = 176;
    const height = 152;
    const gap = 8;
    const top = rect.bottom + gap + height <= window.innerHeight ? rect.bottom + gap : Math.max(8, rect.top - height - gap);
    setMenuPosition({ left: Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8), top });
  }, [isOpen]);

  function handleClick(action: () => void) {
    setIsOpen(false);
    action();
  }

  return (
    <div
      className="relative flex justify-end"
      onClick={(event) => event.stopPropagation()}
      ref={menuRef}
    >
      <button
        aria-expanded={isOpen}
        aria-label={`Open actions for ${userName}`}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface hover:text-navy"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((current) => !current);
        }}
        ref={triggerRef}
        type="button"
      >
        <EllipsisVertical className="h-4 w-4" />
      </button>

      {isOpen ? createPortal(
        <div className="fixed z-[100] w-44 rounded-md border border-border bg-white p-1 shadow-lg" ref={portalMenuRef} style={menuPosition} onClick={(event) => event.stopPropagation()}>
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-navy hover:bg-surface"
            onClick={() => handleClick(onEdit)}
            type="button"
          >
            <SquarePen className="h-4 w-4" />
            Edit
          </button>

          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-navy hover:bg-surface"
            onClick={() => handleClick(onToggleBlock)}
            type="button"
          >
            {isActive ? (
              <Ban className="h-4 w-4" />
            ) : (
              <UnlockKeyhole className="h-4 w-4" />
            )}
            {isActive ? "Block" : "Unblock"}
          </button>

          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-status-fail hover:bg-surface"
            onClick={() => handleClick(onDelete)}
            type="button"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>, document.body,
      ) : null}
    </div>
  );
}
