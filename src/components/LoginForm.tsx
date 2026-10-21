"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { safeRelativePath } from "@/lib/safe-redirect";
import { checkWorkspaceAccess } from "@/lib/auth-flow";

type Mode = "signin" | "signup" | "forgot" | "verify";
const titles: Record<Mode, string> = { signin: "Sign in", signup: "Create account", forgot: "Reset password", verify: "Resend verification email" };

export function LoginForm({ passwordUpdated = false }: { passwordUpdated?: boolean }) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const allowSignup = process.env.NEXT_PUBLIC_ALLOW_SIGNUP === "true";

  useEffect(() => {
    const url = new URL(window.location.href);
    const fragment = new URLSearchParams(url.hash.slice(1));
    if (["access_token", "refresh_token", "error", "error_code", "error_description"].some((key) => fragment.has(key))) {
      router.replace(`/login/complete${url.hash}`);
    } else if (url.searchParams.has("code") || url.searchParams.has("token_hash")) {
      window.location.replace(`/auth/callback${url.search}`);
    }
  }, [router]);

  function changeMode(next: Mode) { setMode(next); setMessage(""); setPassword(""); setConfirmation(""); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const address = email.trim().toLowerCase();
    const nextPath = safeRelativePath(new URLSearchParams(window.location.search).get("next"));
    // Use the already approved exact callback URL, without allowlist wildcards.
    const callback = `${window.location.origin}/auth/callback`;
    if (mode === "signup" && !allowSignup) { setMessage("Account signup is unavailable. Ask a Trackify admin for help."); return; }
    if (mode === "signup" && password !== confirmation) { setMessage("The passwords do not match."); return; }
    setLoading(true);
    setMessage("");
    try {
      if (mode === "forgot" || mode === "verify") {
        const result = mode === "forgot"
          ? await supabase.auth.resetPasswordForEmail(address, { redirectTo: callback })
          : await supabase.auth.resend({ type: "signup", email: address, options: { emailRedirectTo: callback } });
        if (result.error) { setMessage(result.error.message); return; }
        setMessage(mode === "forgot"
          ? "If an account exists for this email, a reset link has been requested. Check your inbox and spam folder, then open the newest link in this browser."
          : "If this account needs verification, a verification email has been requested. Check your inbox and spam folder, then open the newest link in this browser.");
        return;
      }
      const result = mode === "signin"
        ? await supabase.auth.signInWithPassword({ email: address, password })
        : await supabase.auth.signUp({ email: address, password, options: { emailRedirectTo: callback } });
      if (result.error) { setMessage(result.error.message); return; }
      if (mode === "signup" && !result.data.session) {
        setMessage("Check your email and spam folder for the verification link, then open it in this browser. If you already have an account, sign in or reset your password.");
        return;
      }
      await checkWorkspaceAccess();
      router.replace(nextPath);
      router.refresh();
    } catch (failure) {
      setMessage(failure instanceof Error ? failure.message : "Unable to connect to Trackify. Please try again.");
    } finally { setLoading(false); }
  }

  const needsPassword = mode === "signin" || mode === "signup";
  const visibleMessage = message || (passwordUpdated && mode === "signin" ? "Your password was saved. Sign in with your new password." : "");
  return (
    <form onSubmit={submit} className="w-full max-w-sm rounded-xl border border-(--border) bg-white p-5 shadow-xs">
      <h1 className="text-lg font-semibold text-gray-900">{titles[mode]}</h1>
      <p className="mt-1 text-sm text-gray-500">{mode === "signup" ? "Use your company email or the email invited by a Trackify admin." : "Access your Trackify workspace."}</p>
      <label className="mt-4 block text-xs font-medium text-gray-500">Email
        <input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} className="mt-1 w-full rounded-lg border border-(--border) px-3 py-2 text-sm" />
      </label>
      {needsPassword ? <label className="mt-3 block text-xs font-medium text-gray-500">Password
        <input required minLength={mode === "signup" ? 8 : undefined} type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} className="mt-1 w-full rounded-lg border border-(--border) px-3 py-2 text-sm" />
      </label> : null}
      {mode === "signup" ? <label className="mt-3 block text-xs font-medium text-gray-500">Confirm password
        <input required minLength={8} type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} disabled={loading} className="mt-1 w-full rounded-lg border border-(--border) px-3 py-2 text-sm" />
        <span className="mt-2 block">Use at least 8 characters.</span>
      </label> : null}
      {visibleMessage ? <div role="status" aria-live="polite" className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">{visibleMessage}</div> : null}
      <button type="submit" disabled={loading || !email.trim() || (needsPassword && !password)} className="mt-4 w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {loading ? "Working…" : mode === "forgot" ? "Send reset link" : mode === "verify" ? "Resend verification email" : titles[mode]}
      </button>
      {mode === "signin" ? <>
        <button type="button" disabled={loading} onClick={() => changeMode("forgot")} className="mt-3 w-full text-sm text-brand-700">Forgot password?</button>
        {allowSignup ? <button type="button" disabled={loading} onClick={() => changeMode("signup")} className="mt-3 w-full text-sm text-gray-600">Need an account? Create one</button> : null}
        <button type="button" disabled={loading} onClick={() => changeMode("verify")} className="mt-3 w-full text-sm text-gray-600">Resend verification email</button>
      </> : <button type="button" disabled={loading} onClick={() => changeMode("signin")} className="mt-3 w-full text-sm text-gray-600">Back to sign in</button>}
    </form>
  );
}
