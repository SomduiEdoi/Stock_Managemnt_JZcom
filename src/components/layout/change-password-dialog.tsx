"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { localPasswordSchema } from "@/lib/user-account-schema";

export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return (
    <dialog ref={dialog} aria-labelledby="change-password-title" onCancel={(event) => { if (pending) event.preventDefault(); else onClose(); }} onClick={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }} className="m-auto max-h-[90vh] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-md border border-border bg-white p-5 text-navy shadow-xl backdrop:bg-black/35">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 id="change-password-title" className="text-xl font-bold">Change Password</h2>
        <button type="button" title="Close" aria-label="Close" disabled={pending} onClick={onClose} className="rounded-md p-2 hover:bg-surface"><X size={18} /></button>
      </div>
      {saved ? <><p role="status" className="text-sm text-status-ready">Password changed successfully.</p><button type="button" onClick={onClose} className="mt-5 rounded-md bg-navy px-4 py-2 text-sm font-bold text-white">Done</button></> : (
        <form className="space-y-4" onSubmit={async (event) => {
          event.preventDefault();
          const passwordCheck = localPasswordSchema.safeParse(newPassword);
          if (!passwordCheck.success) { setError(passwordCheck.error.issues[0].message); return; }
          if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
          if (newPassword === currentPassword) { setError("Choose a different password."); return; }
          setPending(true); setError("");
          try {
            const response = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) { setError(data.message ?? "Unable to change password."); return; }
            setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); setSaved(true);
          } catch { setError("Unable to connect. Please try again."); }
          finally { setPending(false); }
        }}>
          <fieldset disabled={pending} className="space-y-4">
            {[
              { label: "Current Password", value: currentPassword, change: setCurrentPassword, autocomplete: "current-password" },
              { label: "New Password", value: newPassword, change: setNewPassword, autocomplete: "new-password" },
              { label: "Confirm New Password", value: confirmPassword, change: setConfirmPassword, autocomplete: "new-password" },
            ].map((field) => <label className="block text-sm font-bold" key={field.label}>{field.label}<input required type="password" autoComplete={field.autocomplete} aria-describedby={field.label === "New Password" ? "new-password-policy" : undefined} value={field.value} onChange={(event) => field.change(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-border px-3 font-normal outline-none focus:ring-2 focus:ring-brand-accent/20" />{field.label === "New Password" ? <span id="new-password-policy" className="mt-2 block text-xs font-normal leading-relaxed text-muted-foreground">Password must contain at least 6 characters, with uppercase, lowercase, number, and special character.</span> : null}</label>)}
          </fieldset>
          {error ? <p role="alert" className="text-sm text-status-fail">{error}</p> : null}
          <div className="flex justify-end gap-3"><button type="button" disabled={pending} onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm font-bold">Cancel</button><button disabled={pending} type="submit" className="rounded-md bg-navy px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{pending ? "Saving..." : "Change Password"}</button></div>
        </form>
      )}
    </dialog>
  );
}
