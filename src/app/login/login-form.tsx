"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, KeyRound, LockKeyhole, LogIn } from "lucide-react";

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/auth/login", {
      body: JSON.stringify({ username, password }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;

      setError(body?.message ?? "Login failed.");
      return;
    }

    router.replace(getSafeNextPath(searchParams.get("next")));
    router.refresh();
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
      <label className="flex flex-col gap-2">
        <span className="text-[10px] font-bold uppercase leading-3 text-ink">
          AD Username
        </span>
        <span className="relative">
          <KeyRound
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-navy/80"
            size={18}
          />
          <input
            autoComplete="username"
            className="h-10 w-full rounded-[4px] border border-border/25 bg-white pl-9 pr-4 text-sm text-ink outline-none transition placeholder:text-navy/80 focus:border-navy focus:ring-2 focus:ring-navy/15"
            onChange={(event) => setUsername(event.target.value)}
            placeholder="it01 or it01@ad2012r2.local"
            type="text"
            value={username}
          />
        </span>
      </label>

      <label className="flex flex-col gap-2">
        <span className="flex items-center justify-between gap-4">
          <span className="text-[10px] font-bold uppercase leading-3 text-ink">
            Secure Password
          </span>
          <span className="text-[10px] font-bold leading-3 text-navy">
            Forgot password?
          </span>
        </span>
        <span className="relative">
          <LockKeyhole
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-navy/80"
            size={18}
          />
          <input
            autoComplete="current-password"
            className="h-10 w-full rounded-[4px] border border-border/25 bg-white pl-9 pr-11 text-sm text-ink outline-none transition placeholder:text-navy/80 focus:border-navy focus:ring-2 focus:ring-navy/15"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            type={showPassword ? "text" : "password"}
            value={password}
          />
          <button
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-navy/80 transition hover:bg-surface hover:text-navy"
            onClick={() => setShowPassword((value) => !value)}
            type="button"
          >
            {showPassword ? (
              <EyeOff aria-hidden="true" size={18} />
            ) : (
              <Eye aria-hidden="true" size={18} />
            )}
          </button>
        </span>
      </label>

      <label className="flex items-center gap-3">
        <input
          className="h-4 w-4 rounded border-border/25 text-navy focus:ring-navy"
          type="checkbox"
        />
        <span className="select-none text-xs leading-4 text-navy/80">
          Maintain session for 8 hours
        </span>
      </label>

      {error ? (
        <p className="rounded-md border border-status-fail/20 bg-status-fail/10 px-3 py-2 text-sm text-status-fail">
          {error}
        </p>
      ) : null}

      <button
        className="mt-1 flex h-[52px] w-full items-center justify-center gap-3 rounded-md bg-navy px-4 text-base font-semibold text-white shadow-[0_7px_14px_rgba(15,41,56,0.2)] transition hover:bg-brand-accent active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
        disabled={isSubmitting}
        type="submit"
      >
        <span>{isSubmitting ? "Verifying..." : "Authenticate"}</span>
        <LogIn aria-hidden="true" size={20} />
      </button>
    </form>
  );
}
