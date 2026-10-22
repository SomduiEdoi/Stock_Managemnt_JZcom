"use client";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
export function confirmDestructiveAction(scope: string, name: string): Promise<string | null> {
  return new Promise((resolve) => {
    const host = document.createElement("div"); document.body.appendChild(host);
    const root = createRoot(host);
    const finish = (proof: string | null) => { resolve(proof); setTimeout(() => { root.unmount(); host.remove(); }, 0); };
    root.render(<Confirmation scope={scope} name={name} finish={finish} />);
  });
}
function Confirmation({ scope, name, finish }: { scope: string; name: string; finish: (proof: string | null) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState("");
  const [proof, setProof] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    if (!proof) return;
    const timer = setTimeout(() => { setProof(null); setError("Verification expired. Please verify your password again."); }, 55000);
    return () => clearTimeout(timer);
  }, [proof]);
  async function verify() {
    setPending(true); setError("");
    try {
      const response = await fetch("/api/auth/verify-deletion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, scope }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Unable to verify password.");
      setPassword(""); setProof(data.proof);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to verify password."); }
    finally { setPending(false); }
  }
  return <dialog ref={dialog} aria-labelledby="delete-confirmation-title" onCancel={(event) => { event.preventDefault(); if (!pending) finish(null); }} className="w-[calc(100%_-_2rem)] max-w-md rounded-md border border-border bg-white p-6 text-ink shadow-xl backdrop:bg-black/40">
    <h2 id="delete-confirmation-title" className="text-lg font-bold text-navy">Confirm deletion</h2>
    <p className="mt-3 break-words text-sm">You are deleting: <strong>{name}</strong></p>
    <p className="mt-2 text-sm text-status-fail">This action removes data from active use and may be irreversible.</p>
    {!proof ? <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); void verify(); }}><label className="block text-sm font-bold">Your current password<input autoFocus required autoComplete="current-password" type="password" value={password} disabled={pending} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-border px-3" /></label><button disabled={!password || pending} className="rounded-md bg-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-40" type="submit">{pending ? "Verifying..." : "Verify password"}</button></form> : <p role="status" className="mt-4 text-sm text-green-700">Password verified.</p>}
    {error ? <p role="alert" className="mt-3 text-sm text-status-fail">{error}</p> : null}
    <div className="mt-5 flex justify-end gap-3"><button disabled={pending} onClick={() => finish(null)} className="rounded-md border border-border px-4 py-2" type="button">Cancel</button><button disabled={!proof || pending} onClick={() => proof && finish(proof)} className="rounded-md bg-status-fail px-4 py-2 font-bold text-white disabled:opacity-40" type="button">Confirm Delete</button></div>
  </dialog>;
}
