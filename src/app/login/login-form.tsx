"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, LockKeyhole, LogIn, Mail } from "lucide-react";

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }

  return value;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("ChangeMe123!");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/auth/login", {
      body: JSON.stringify({ email, password }),
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
        <span className="text-[10px] font-bold uppercase leading-3 text-[#1b1c1a]">
          Work Email
        </span>
        <span className="relative">
          <Mail
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#42474c]"
            size={18}
          />
          <input
            autoComplete="email"
            className="h-10 w-full rounded-[4px] border border-[#c3c7cc] bg-white pl-9 pr-4 text-sm text-[#1b1c1a] outline-none transition placeholder:text-[#42474c] focus:border-[#0f2938] focus:ring-2 focus:ring-[#0f2938]/15"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@company.com"
            type="email"
            value={email}
          />
        </span>
      </label>

      <label className="flex flex-col gap-2">
        <span className="flex items-center justify-between gap-4">
          <span className="text-[10px] font-bold uppercase leading-3 text-[#1b1c1a]">
            Secure Password
          </span>
          <span className="text-[10px] font-bold leading-3 text-[#0f2938]">
            Forgot password?
          </span>
        </span>
        <span className="relative">
          <LockKeyhole
            aria-hidden="true"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[#42474c]"
            size={18}
          />
          <input
            autoComplete="current-password"
            className="h-10 w-full rounded-[4px] border border-[#c3c7cc] bg-white pl-9 pr-11 text-sm text-[#1b1c1a] outline-none transition placeholder:text-[#42474c] focus:border-[#0f2938] focus:ring-2 focus:ring-[#0f2938]/15"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            type={showPassword ? "text" : "password"}
            value={password}
          />
          <button
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-[#42474c] transition hover:bg-[#efeeea] hover:text-[#0f2938]"
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
          className="h-4 w-4 rounded border-[#c3c7cc] text-[#0f2938] focus:ring-[#0f2938]"
          type="checkbox"
        />
        <span className="select-none text-xs leading-4 text-[#42474c]">
          Maintain session for 8 hours
        </span>
      </label>

      {error ? (
        <p className="rounded-md border border-[#ffdad6] bg-[#fff0ee] px-3 py-2 text-sm text-[#93000a]">
          {error}
        </p>
      ) : null}

      <button
        className="mt-1 flex h-[52px] w-full items-center justify-center gap-3 rounded-md bg-[#0f2938] px-4 text-base font-semibold text-white shadow-[0_7px_14px_rgba(15,41,56,0.2)] transition hover:bg-[#32495a] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
        disabled={isSubmitting}
        type="submit"
      >
        <span>{isSubmitting ? "Verifying..." : "Authenticate"}</span>
        <LogIn aria-hidden="true" size={20} />
      </button>
    </form>
  );
}
