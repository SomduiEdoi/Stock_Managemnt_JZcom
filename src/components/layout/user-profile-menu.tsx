"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import type { RoleCode } from "@/lib/permissions";

type UserProfileMenuProps = {
  name: string;
  position: string | null;
  roles: RoleCode[];
};

type ProfileDisplayProps = {
  name: string;
  position: string | null;
  primaryRole: string;
};

type ProfileTriggerProps = ProfileDisplayProps & {
  isOpen: boolean;
  onToggle: () => void;
};

type ProfileDropdownProps = ProfileDisplayProps & {
  isPending: boolean;
  onLogout: () => void;
};

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getPrimaryRole(roles: RoleCode[]) {
  return roles[0] ?? "USER";
}

function ProfileTrigger({
  isOpen,
  name,
  onToggle,
  position,
  primaryRole,
}: ProfileTriggerProps) {
  return (
    <button
      aria-expanded={isOpen}
      aria-haspopup="menu"
      className={`flex items-center gap-3 rounded-md px-1 py-1 pr-2 transition ${
        isOpen ? "bg-surface" : "hover:bg-surface"
      }`}
      onClick={onToggle}
      type="button"
    >
      <span className="hidden text-right sm:block">
        <span className="block text-sm font-bold text-navy">{name}</span>
        <span className="block text-xs font-medium text-muted-foreground">
          {position ?? primaryRole}
        </span>
      </span>
      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-navy text-sm font-bold text-white">
        {getInitials(name)}
      </span>
      <ChevronDown
        className={`h-4 w-4 text-muted-foreground transition ${
          isOpen ? "rotate-180" : ""
        }`}
      />
    </button>
  );
}

function ProfileDropdown({
  isPending,
  name,
  onLogout,
  position,
  primaryRole,
}: ProfileDropdownProps) {
  return (
    <div
      className="absolute right-0 top-full z-30 mt-2 w-64 rounded-md border border-border bg-white p-2 shadow-lg"
      role="menu"
    >
      <div className="flex items-center gap-3 border-b border-border px-3 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-navy text-xs font-bold text-white">
          {getInitials(name)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-navy">{name}</p>
          <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">
            {position ?? primaryRole}
          </p>
        </div>
      </div>
      <Link
        className="mt-2 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-navy transition hover:bg-surface"
        href="/dashboard/settings"
        role="menuitem"
      >
        <Settings className="h-4 w-4" />
        Settings
      </Link>
      <button
        className="mt-2 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-status-fail transition hover:bg-status-fail/10 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        onClick={onLogout}
        role="menuitem"
        type="button"
      >
        <LogOut className="h-4 w-4" />
        {isPending ? "Signing out..." : "Sign out"}
      </button>
    </div>
  );
}

export function UserProfileMenu({
  name,
  position,
  roles,
}: UserProfileMenuProps) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const primaryRole = getPrimaryRole(roles);

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

  async function handleLogout() {
    setIsPending(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="relative" ref={menuRef}>
      <ProfileTrigger
        isOpen={isOpen}
        name={name}
        onToggle={() => setIsOpen((current) => !current)}
        position={position}
        primaryRole={primaryRole}
      />

      {isOpen ? (
        <ProfileDropdown
          isPending={isPending}
          name={name}
          onLogout={handleLogout}
          position={position}
          primaryRole={primaryRole}
        />
      ) : null}
    </div>
  );
}
