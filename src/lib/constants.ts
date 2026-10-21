// Platforms supported, mirroring Shortimize's 6 supported networks.
export const PLATFORMS = [
  "tiktok",
  "instagram",
  "youtube",
  "facebook",
  "snapchat",
  "x",
] as const;

export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
  snapchat: "Snapchat",
  x: "X",
};

export const PLATFORM_COLORS: Record<Platform, string> = {
  tiktok: "#000000",
  instagram: "#E1306C",
  youtube: "#FF0000",
  facebook: "#1877F2",
  snapchat: "#FFFC00",
  x: "#1d1d1f",
};

export const COLLECTION_TYPES = [
  "brand",
  "paid",
  "seeding",
  "affiliate",
  "custom",
] as const;

export type CollectionType = (typeof COLLECTION_TYPES)[number];

// Date-range presets shown in the filter bar.
export const RANGE_PRESETS = [
  { id: "7d", label: "Last 7 days", days: 7 },
  { id: "14d", label: "Last 14 days", days: 14 },
  { id: "30d", label: "Last 30 days", days: 30 },
  { id: "90d", label: "Last 90 days", days: 90 },
] as const;

export type RangePresetId = (typeof RANGE_PRESETS)[number]["id"];
