"use client";

import { useEffect, useRef, useState } from "react";
import {
  Ban,
  EllipsisVertical,
  Pencil,
  Tags,
  Trash2,
  UnlockKeyhole,
} from "lucide-react";

type UserActionMenuProps = {
  canAssign: boolean;
  isActive: boolean;
  onAssign: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onToggleBlock: () => void;
  userName: string;
};

export function UserActionMenu({
  canAssign,
  isActive,
  onAssign,
  onDelete,
  onEdit,
  onToggleBlock,
  userName,
}: UserActionMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
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

  function handleClick(action: () => void) {
    setIsOpen(false);
    action();
  }

  return (
    <div className="relative flex justify-end" ref={menuRef}>
      <button
        aria-expanded={isOpen}
        aria-label={`Open actions for ${userName}`}
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-surface hover:text-navy"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <EllipsisVertical className="h-4 w-4" />
      </button>

      {isOpen ? (
        <div className="absolute right-0 top-9 z-20 w-44 rounded-md border border-border bg-white p-1 shadow-lg">
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-navy hover:bg-surface"
            onClick={() => handleClick(onEdit)}
            type="button"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>

          {canAssign ? (
            <button
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-navy hover:bg-surface"
              onClick={() => handleClick(onAssign)}
              type="button"
            >
              <Tags className="h-4 w-4" />
              Assign
            </button>
          ) : null}

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
        </div>
      ) : null}
    </div>
  );
}
