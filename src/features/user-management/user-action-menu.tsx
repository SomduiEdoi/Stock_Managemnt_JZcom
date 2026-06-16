"use client";

import { useState } from "react";
import {
  Ban,
  EllipsisVertical,
  Pencil,
  Trash2,
  UnlockKeyhole,
} from "lucide-react";

type UserActionMenuProps = {
  isActive: boolean;
  userName: string;
};

export function UserActionMenu({ isActive, userName }: UserActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative flex justify-end">
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
            type="button"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-navy hover:bg-surface"
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
