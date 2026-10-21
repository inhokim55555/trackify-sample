"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { checkWorkspaceAccess, finishBrowserAuthLink, PASSWORD_LINK_ERROR } from "@/lib/auth-flow";

export function AuthLinkComplete() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const started = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const url = new URL(window.location.href);
    window.history.replaceState(window.history.state, "", "/login/complete");
    async function finish() {
      try {
        const destination = await finishBrowserAuthLink(supabase.auth, url);
        if (destination !== "/login/update-password") await checkWorkspaceAccess();
        router.replace(destination);
        router.refresh();
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : PASSWORD_LINK_ERROR);
      }
    }
    void finish();
  }, [router, supabase]);
  return (
    <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
      <h1 className="text-lg font-semibold text-gray-900">{error ? "Unable to finish sign-in" : "Checking email link"}</h1>
      <p role={error ? "alert" : "status"} className="mt-3 text-sm text-gray-600">{error || "Finishing sign-in to Trackify…"}</p>
      {error ? <a href="/login" className="mt-4 block text-sm text-brand-700 underline">Back to sign in, reset password, or resend verification</a> : null}
    </div>
  );
}
