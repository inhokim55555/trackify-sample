"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { CampaignProvider } from "@/components/CampaignContext";
import { FilterProvider } from "@/components/FilterContext";
import { Sidebar } from "@/components/Sidebar";
import { FilterBar } from "@/components/FilterBar";
import { ToastProvider } from "@/components/Toast";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { saveSession } from "@/lib/save-session";
import { invalidateApiCache } from "@/lib/useApi";

const serverSession = { owner: null, ready: false };
const sessionSnapshot = () => saveSession.snapshot();
const serverSessionSnapshot = () => serverSession;
const subscribeSession = (onChange: () => void) => saveSession.subscribe(() => {
  invalidateApiCache();
  onChange();
});

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [navigation, setNavigation] = useState({ pathname, open: false });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const session = useSyncExternalStore(subscribeSession, sessionSnapshot, serverSessionSnapshot);
  // Reset before rendering a new route, so revisiting the old route cannot reopen it.
  if (navigation.pathname !== pathname) setNavigation({ pathname, open: false });
  const mobileNavOpen = navigation.pathname === pathname && navigation.open;
  const setMobileNavOpen = (open: boolean) => setNavigation({ pathname, open });

  // AppShell persists through Campaign, other app routes, and SPA login.
  useEffect(() => {
    // Dashboard email links can return to the Site URL even while another account
    // is signed in. Complete the incoming link before mounting workspace features.
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    if (!window.location.pathname.startsWith("/login")) {
      if (["access_token", "refresh_token", "error", "error_code", "error_description"].some((key) => fragment.has(key))) {
        window.location.replace(`/login/complete${window.location.hash}`);
        return;
      }
      if (query.has("code") || query.has("token_hash")) {
        window.location.replace(`/auth/callback${window.location.search}`);
        return;
      }
    }
    let active = true;
    const supabase = createSupabaseBrowserClient();
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      if (event === "SIGNED_OUT") saveSession.clear();
      else saveSession.setUser(nextSession?.user.id ?? null);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
      saveSession.clear();
    };
  }, []);

  if (pathname.startsWith("/login")) return <>{children}</>;
  if (!session.ready) return <p role="status" className="p-5 text-sm text-gray-600">Checking your session...</p>;
  if (!session.owner) return <p className="p-5 text-sm text-gray-600">Your session ended. <a className="text-brand-700 underline" href="/login">Sign in again</a>.</p>;

  const showFilterBar =
    !pathname.startsWith("/accounts") &&
    !pathname.startsWith("/campaigns") &&
    !pathname.startsWith("/settings");
  const isCampaignRoute = pathname.startsWith("/campaigns");

  const shell = (
    <div className="flex h-screen overflow-hidden">
      <div className="hidden lg:block">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((current) => !current)}
        />
      </div>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute inset-y-0 left-0 shadow-xl">
            <Sidebar />
          </div>
          <button
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
            className="absolute left-[248px] top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-600 shadow-sm"
          >
            <X size={16} />
          </button>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-(--border) bg-white px-4 py-2.5 lg:hidden">
          <button
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
          >
            <Menu size={18} />
          </button>
          <span className="text-sm font-semibold">Trackify</span>
        </div>

        {showFilterBar ? <FilterBar /> : null}
        <main className="flex-1 overflow-y-auto scroll-thin">{children}</main>
      </div>
    </div>
  );

  return (
    <ToastProvider key={`${session.owner.userId}:${session.owner.revision}`}>
      <FilterProvider>
        {isCampaignRoute ? <CampaignProvider>{shell}</CampaignProvider> : shell}
      </FilterProvider>
    </ToastProvider>
  );
}
