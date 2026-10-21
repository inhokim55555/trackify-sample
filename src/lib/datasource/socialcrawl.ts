import {AppError} from '@/lib/errors';


export function isTikTokPhotoUrl(rawUrl: string): boolean {
  const url = new URL(rawUrl);
  return socialPostIdentity(rawUrl)?.startsWith("tiktok:") === true &&
    /^\/@[^/]+\/photo\/\d+\/?$/.test(url.pathname);
}


export function canonicalSocialUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new AppError("Enter a valid social video URL.", 400);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AppError("Enter a valid http(s) social video URL.", 400);
  }
  url.hash = "";
  if (socialPostIdentity(url.toString())) url.search = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || key === "si" || key === "igsh") {
      url.searchParams.delete(key);
    }
  }
  return url.toString().replace(/\/$/, "");
}


/** Photo and video URLs can refer to the same TikTok post ID. */
export function socialPostIdentity(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase().replace(/^(www|m)\./, "");
    if (host === "tiktok.com") {
      const match = url.pathname.match(/^\/@[^/]+\/(?:video|photo)\/(\d+)\/?$/);
      return match ? `tiktok:${match[1]}` : null;
    }
    if (host === "instagram.com") {
      const match = url.pathname.match(/^\/(?:p|reel|reels|tv)\/([\w-]+)\/?$/);
      return match ? `instagram:${match[1]}` : null;
    }
  } catch { /* Invalid URLs have no post identity. */ }
  return null;
}
