import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-5xl items-center gap-8 md:grid-cols-[1fr_360px]">
        <section>
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Stock Management System
          </p>
          <h1 className="mt-3 max-w-2xl text-3xl font-semibold">
            Sign in to manage Server and Network stock.
          </h1>
          <p className="mt-4 max-w-xl text-muted-foreground">
            MVP login uses seeded email and password accounts. Microsoft 365
            sign-in can replace this entry point later without changing the
            permission model.
          </p>
        </section>

        <section className="rounded-md border border-border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Login</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Default seeded password is ChangeMe123!
          </p>
          <div className="mt-6">
            <Suspense>
              <LoginForm />
            </Suspense>
          </div>
        </section>
      </div>
    </main>
  );
}
