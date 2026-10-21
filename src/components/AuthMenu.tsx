"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LogOut, UserCircle } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { saveSession } from "@/lib/save-session";

export function AuthMenu() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setEmail(data.user?.email ?? null);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmail(session?.user.email ?? null);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  async function signOut() {
    saveSession.clear();
    await supabase.auth.signOut();
    setEmail(null);
    // Full navigation discards authenticated component and module state at sign-out.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }

  if (!email) {
    return (
      <Link
        href="/login"
        className="flex w-full items-center justify-center rounded-lg border border-(--border) bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="rounded-lg border border-(--border) bg-white p-2">
      <div className="flex min-w-0 items-center gap-2">
        <UserCircle size={17} className="shrink-0 text-gray-400" />
        <span className="min-w-0 flex-1 truncate text-xs text-gray-600">
          {email}
        </span>
        <button
          onClick={signOut}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Sign out"
        >
          <LogOut size={14} />
        </button>
      </div>
    </div>
  );
}
