"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PASSWORD_LINK_ERROR } from "@/lib/auth-flow";

export function UpdatePasswordForm() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error || !data.user?.email) setMessage(PASSWORD_LINK_ERROR);
      else { setEmail(data.user.email); setReady(true); }
    }).catch(() => { if (active) setMessage("Unable to check your session. Please reload and try again."); });
    return () => { active = false; };
  }, [supabase]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || !ready) return;
    if (password !== confirmation) { setMessage("The passwords do not match."); return; }
    if (password.length < 8) { setMessage("Use at least 8 characters for your new password."); return; }
    setLoading(true);
    setMessage("");
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) { setMessage(error.message); return; }
      const signedOut = await supabase.auth.signOut({ scope: "local" });
      if (signedOut.error) { setMessage("Your password was saved. Close this tab and sign in with your new password."); return; }
      router.replace("/login?notice=password-updated");
      router.refresh();
    } catch { setMessage("Unable to save your password. Please try again."); }
    finally { setLoading(false); }
  }
  return (
    <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-(--border) bg-white p-5 shadow-xs">
      <h1 className="text-lg font-semibold text-gray-900">Set new password</h1>
      <p className="mt-2 text-sm text-gray-600">{email ? `Set a password for ${email}.` : message ? "Request a fresh email link to continue." : "Checking your email link…"}</p>
      <label className="mt-4 block text-xs font-medium text-gray-500">New password
        <input required minLength={8} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={!ready || loading} className="mt-1 w-full rounded-lg border border-(--border) px-3 py-2 text-sm" />
      </label>
      <label className="mt-3 block text-xs font-medium text-gray-500">Confirm new password
        <input required minLength={8} type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} disabled={!ready || loading} className="mt-1 w-full rounded-lg border border-(--border) px-3 py-2 text-sm" />
      </label>
      <p className="mt-2 text-xs text-gray-500">Use at least 8 characters.</p>
      {message ? <p role="alert" className="mt-3 text-sm text-gray-600">{message}</p> : null}
      <button type="submit" disabled={!ready || loading || !password || !confirmation} className="mt-4 w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{loading ? "Saving…" : "Save password"}</button>
      <a href="/login" className="mt-3 block text-center text-sm text-brand-700 underline">Back to sign in</a>
    </form>
  );
}
