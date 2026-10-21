import type { SupabaseClient } from "@supabase/supabase-js";
import { safeRelativePath } from "@/lib/safe-redirect";

export const PASSWORD_LINK_ERROR = "This email link is invalid or has expired. Request a new password-reset or verification email. Open the newest link; for a link requested in Trackify, use the same browser.";

export function authLinkDestination(url: URL) {
  const type = new URLSearchParams(url.hash.slice(1)).get("type") ?? url.searchParams.get("type");
  const next = safeRelativePath(url.searchParams.get("next"));
  return ["recovery", "invite", "magiclink"].includes(type ?? "") ? "/login/update-password" : next;
}

/** Accept dashboard fragment links as well as server-exchanged PKCE links. */
export async function finishBrowserAuthLink(auth: SupabaseClient["auth"], url: URL) {
  const fragment = new URLSearchParams(url.hash.slice(1));
  if ([url.searchParams, fragment].some((params) => params.has("error") || params.has("error_code") || params.has("error_description"))) throw new Error(PASSWORD_LINK_ERROR);
  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");
  if (accessToken || refreshToken) {
    if (!accessToken || !refreshToken) throw new Error(PASSWORD_LINK_ERROR);
    const { error } = await auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) throw new Error(PASSWORD_LINK_ERROR);
  }
  const { data, error } = await auth.getUser();
  if (error || !data.user?.email) throw new Error(PASSWORD_LINK_ERROR);
  return authLinkDestination(url);
}

export async function checkWorkspaceAccess() {
  const response = await fetch("/api/auth/access", { method: "POST", cache: "no-store" });
  if (!response.ok) {
    if (response.status === 403) throw new Error("Your account is signed in, but workspace access is unavailable. Ask a Trackify admin to invite this email or check whether your access has been disabled.");
    if (response.status === 401) throw new Error("Your session has expired. Sign in again.");
    throw new Error("Trackify could not check workspace access. Please try signing in again.");
  }
}
