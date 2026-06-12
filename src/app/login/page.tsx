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
    <main className="flex min-h-screen items-center justify-center bg-[#faf9f5] px-5 py-8 text-[#1b1c1a]">
      <div className="w-full max-w-[384px]">
        <section className="mb-5 flex flex-col items-center text-center">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-[#273f4f] text-white shadow-sm">
            <Archive aria-hidden="true" size={22} strokeWidth={2.4} />
          </div>
          <h1 className="text-[25px] font-bold leading-8 text-[#0f2938]">
            Stock Management
          </h1>
          <p className="mt-1 text-[10px] font-bold leading-3 text-[#42474c]">
            Enterprise Source of Truth
          </p>
        </section>

        <section className="rounded-md border border-[#c3c7cc] bg-white p-9 shadow-[0_5px_14px_rgba(15,41,56,0.08)]">
          <header className="mb-7">
            <h2 className="text-xl font-semibold leading-7 text-[#1b1c1a]">
              Login
            </h2>
            <p className="mt-1 max-w-[260px] text-xs leading-4 text-[#42474c]">
              Enter your credentials to manage Stock Management enterprise
              assets.
            </p>
          </header>

          <div>
            <Suspense>
              <LoginForm />
            </Suspense>
          </div>

          <footer className="mt-7 border-t border-[#c3c7cc] pt-5 text-center">
            <p className="text-xs leading-4 text-[#42474c]">
              Need system access?{" "}
              <span className="font-medium text-[#0f2938]">
                Contact Administrator
              </span>
            </p>
          </footer>
        </section>

        <section className="mt-5 flex items-center justify-between px-3">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#22c55e]" />
            <span className="text-[10px] font-bold uppercase leading-3 text-[#42474c]">
              Server: Operational
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ShieldCheck
              aria-hidden="true"
              className="text-[#42474c]"
              size={15}
            />
            <span className="text-[10px] font-bold uppercase leading-3 text-[#42474c]">
              v2.4.0-Stable
            </span>
          </div>
        </section>
      </div>
    </main>
  );
}
