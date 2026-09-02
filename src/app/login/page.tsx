import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Archive, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-5 py-8 text-ink">
      <div className="w-full max-w-[384px]">
        <section className="mb-5 flex flex-col items-center text-center">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-navy text-white shadow-sm">
            <Archive aria-hidden="true" size={22} strokeWidth={2.4} />
          </div>
          <h1 className="text-[25px] font-bold leading-8 text-navy">
            Warehouse Management
          </h1>
          <p className="mt-1 text-[10px] font-bold leading-3 text-navy/80">
            Enterprise Source of Truth
          </p>
        </section>

        <section className="rounded-md border border-border/25 bg-white p-9 shadow-[0_5px_14px_rgba(15,41,56,0.08)]">
          <header className="mb-7">
            <h2 className="text-xl font-semibold leading-7 text-ink">
              Login
            </h2>
            <p className="mt-1 max-w-[260px] text-xs leading-4 text-navy/80">
              Enter your credentials to manage Warehouse Management enterprise
              assets.
            </p>
          </header>

          <div>
            <Suspense>
              <LoginForm />
            </Suspense>
          </div>

          <footer className="mt-7 border-t border-border/25 pt-5 text-center">
            <p className="text-xs leading-4 text-navy/80">
              Need system access?{" "}
              <span className="font-medium text-navy">
                Contact Administrator
              </span>
            </p>
          </footer>
        </section>

        <section className="mt-5 flex items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-status-ready" />
            <span className="text-[10px] font-bold uppercase leading-3 text-navy/80">
              Server: Operational
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck
              aria-hidden="true"
              className="text-navy/80"
              size={15}
            />
            <span className="text-[10px] font-bold uppercase leading-3 text-navy/80">
              v2.4.0-Stable
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}
