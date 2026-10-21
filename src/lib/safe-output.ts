export function redactSensitiveText(value: string): string {
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[redacted database url]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(
      /\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|ACCESS_KEY|AUTH)[A-Z0-9_]*)=([^\s"'`&]+)/gi,
      "$1=[redacted]"
    )
    .replace(/\b(api[_-]?key|token|secret|password|authorization)=([^\s"'`&]+)/gi, "$1=[redacted]")
    .replace(/https?:\/\/[^\s"'`<>]+/gi, "[redacted url]");
}

export function safeErrorMessage(err: unknown, fallback = "Operation failed"): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : fallback;
  const sanitized = redactSensitiveText(raw).trim();
  return sanitized ? sanitized.slice(0, 240) : fallback;
}

export function safeErrorLogDetails(err: unknown) {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: safeErrorMessage(err),
      stack:
        process.env.NODE_ENV === "production" || !err.stack
          ? undefined
          : redactSensitiveText(err.stack),
    };
  }
  return { message: safeErrorMessage(err) };
}

export function csvCell(value: string | number | null | undefined) {
  const raw = String(value ?? "");
  const safe = isDangerousSpreadsheetCell(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function isDangerousSpreadsheetCell(value: string) {
  return /^[=+\-@\t\r\n]/.test(value) || /^\s+[=+\-@]/.test(value);
}
