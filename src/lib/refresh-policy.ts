// Fixed user-approved upload cohort: strictly after July 9, 2026. Upload dates
// are stored as UTC metadata dates; this is deliberately not a rolling window.
export const REFRESH_UPLOAD_START_ISO = "2026-07-10T00:00:00.000Z";
export const REFRESH_UPLOAD_START = new Date(REFRESH_UPLOAD_START_ISO);

export function refreshUploadDateFilter(now = new Date()) {
  return { gte: new Date(REFRESH_UPLOAD_START_ISO), lte: now };
}

// Railway cron uses UTC. Two Monday triggers cover daylight saving changes;
// only the trigger that lands at 09:00 Pacific may actually call the provider.
export function isScheduledRefreshTime(now = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", weekday: "short", hour: "2-digit",
    minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return value("weekday") === "Mon" && value("hour") === "09" && Number(value("minute")) <= 10;
}
