const REDIRECT_BASE = "https://trackify.invalid";

/** Accept only a normalized path within this app, for both browser and server redirects. */
export function safeRelativePath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/";
  // URL parsing strips tabs/newlines and can reinterpret a seemingly relative
  // destination. Reject control characters before allowing that normalization.
  if (Array.from(next).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  })) return "/";

  try {
    const destination = new URL(next, REDIRECT_BASE);
    // Dot-segment normalization can turn /x/..//host into //host. Do not return
    // a network-path reference that a subsequent redirect would reinterpret.
    if (destination.origin !== REDIRECT_BASE || destination.pathname.startsWith("//")) return "/";
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/";
  }
}
