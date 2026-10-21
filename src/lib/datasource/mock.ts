import type { Platform } from "@/lib/constants";
import { PLATFORMS } from "@/lib/constants";
import type {
  DataSource,
  FetchAccountOptions,
  FetchVideoOptions,
  ScrapedAccount,
  ScrapedMetricPoint,
  ScrapedVideo,
} from "./types";

// ── Deterministic PRNG ────────────────────────────────────────────────
// Seeded from a string so the same handle always generates the same data.
function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = () => number;

function randInt(rng: Rng, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ── Content vocabulary for believable captions ────────────────────────
const CAPTION_HOOKS = [
  "Ready to level up your routine?",
  "I can't believe this actually worked",
  "POV: you finally found the one",
  "Gifted by the brand and obsessed",
  "Honest 30-day review",
  "The viral product everyone is talking about",
  "Watch this before you buy",
  "This changed my whole morning routine",
  "3 reasons this sold out everywhere",
  "Trying the trend so you don't have to",
  "Day 1 vs Day 14 results",
  "Why is nobody talking about this?",
];

const CAPTION_TOPICS = [
  "skincare glow-up",
  "the new sunscreen stick",
  "this eye cream",
  "a cooling gel that actually works",
  "the cleansing balm",
  "this primer",
  "the affiliate code in my bio",
  "the seeding box that arrived",
  "this retinol serum",
  "the tinted moisturizer",
];

const HASHTAGS = [
  "#tiktokmademebuyit",
  "#skincare",
  "#gifted",
  "#review",
  "#fyp",
  "#beauty",
  "#unboxing",
  "#grwm",
];

function makeCaption(rng: Rng): string {
  const tags = Array.from({ length: randInt(rng, 1, 3) }, () => pick(rng, HASHTAGS));
  return `${pick(rng, CAPTION_HOOKS)} ${pick(rng, CAPTION_TOPICS)} ${tags.join(" ")}`;
}

// ── Time helpers ──────────────────────────────────────────────────────
function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

// ── Per-video cumulative series ───────────────────────────────────────
// Produces a saturating growth curve from uploadDate -> today, with a
// fraction of videos getting a steep "viral" early ramp.
function buildVideoSeries(
  rng: Rng,
  uploadDate: Date,
  today: Date,
  finalViews: number
): ScrapedMetricPoint[] {
  const totalDays = Math.max(1, daysBetween(uploadDate, today));
  const isViral = rng() < 0.18;
  // Logistic-ish steepness; viral videos saturate faster.
  const steepness = isViral ? randInt(rng, 6, 10) : randInt(rng, 3, 6);
  const midpoint = isViral ? 0.18 : 0.45; // where growth is fastest (0..1)

  // Engagement ratios (relative to views) — stable per video.
  const likeRatio = 0.03 + rng() * 0.09; // 3%–12%
  const commentRatio = 0.001 + rng() * 0.009; // 0.1%–1%
  const shareRatio = rng() * 0.02; // 0%–2%
  const saveRatio = rng() * 0.03; // 0%–3%

  const points: ScrapedMetricPoint[] = [];
  for (let i = 0; i <= totalDays; i++) {
    const t = totalDays === 0 ? 1 : i / totalDays; // 0..1 progress
    // logistic CDF normalised so progress(0)~0 and progress(1)~1
    const logistic = (x: number) =>
      1 / (1 + Math.exp(-steepness * (x - midpoint)));
    const lo = logistic(0);
    const hi = logistic(1);
    const progress = (logistic(t) - lo) / (hi - lo || 1);
    // small day-to-day noise so the line isn't perfectly smooth
    const noise = 0.97 + rng() * 0.06;
    const views = Math.round(finalViews * progress * noise);
    const v = Math.max(0, views);
    points.push({
      date: addDays(uploadDate, i),
      views: v,
      likes: Math.round(v * likeRatio),
      comments: Math.round(v * commentRatio),
      shares: Math.round(v * shareRatio),
      saves: Math.round(v * saveRatio),
    });
  }
  // Enforce monotonic non-decreasing cumulative metrics.
  for (let i = 1; i < points.length; i++) {
    points[i].views = Math.max(points[i].views, points[i - 1].views);
    points[i].likes = Math.max(points[i].likes, points[i - 1].likes);
    points[i].comments = Math.max(points[i].comments, points[i - 1].comments);
    points[i].shares = Math.max(points[i].shares, points[i - 1].shares);
    points[i].saves = Math.max(points[i].saves, points[i - 1].saves);
  }
  return points;
}

// Heavy-tailed final view count: most videos modest, a few huge.
function sampleFinalViews(rng: Rng): number {
  const r = rng();
  if (r > 0.97) return randInt(rng, 1_000_000, 12_000_000); // mega-viral
  if (r > 0.85) return randInt(rng, 100_000, 1_000_000); // viral
  if (r > 0.55) return randInt(rng, 10_000, 100_000); // solid
  return randInt(rng, 120, 10_000); // long tail
}

export interface GenerateAccountOptions extends FetchAccountOptions {
  seedSuffix?: string;
}

export interface GenerateVideoOptions extends FetchVideoOptions {}

function platformFromVideoUrl(videoUrl: string): Platform {
  const host = new URL(videoUrl).hostname.toLowerCase().replace(/^www\./, "");
  if (host.includes("tiktok")) return "tiktok";
  if (host.includes("instagram")) return "instagram";
  if (host.includes("youtube") || host === "youtu.be") return "youtube";
  if (host.includes("facebook") || host === "fb.watch") return "facebook";
  if (host.includes("snapchat")) return "snapchat";
  if (host === "x.com" || host.endsWith(".x.com") || host.includes("twitter")) {
    return "x";
  }
  throw new Error(
    "Video URL must be from TikTok, Instagram, YouTube, Facebook, Snapchat, or X."
  );
}

function importedCreatorFromUrl(videoUrl: string, platform: Platform, key: string) {
  const url = new URL(videoUrl);
  const parts = url.pathname.split("/").filter(Boolean);
  const first = parts[0] ?? "";
  const second = parts[1] ?? "";

  if (first.startsWith("@")) {
    const handle = first.replace(/^@/, "");
    return { handle, displayName: handle };
  }

  if (platform === "instagram" && (first === "reel" || first === "p") && second) {
    const handle = `instagram-${first}-${second}`;
    return { handle, displayName: "Instagram imported video" };
  }

  if (platform === "tiktok" && first === "t" && second) {
    const handle = `tiktok-short-${second}`;
    return { handle, displayName: "TikTok imported video" };
  }

  if (platform === "youtube" && first === "shorts" && second) {
    const handle = `youtube-short-${second}`;
    return { handle, displayName: "YouTube imported video" };
  }

  const handle = `${platform}-video-${key}`;
  return { handle, displayName: `${platform} imported video` };
}

export function generateVideoFromUrl(
  videoUrl: string,
  options: GenerateVideoOptions = {}
): ScrapedAccount {
  const canonicalUrl = new URL(videoUrl).toString();
  const platform = platformFromVideoUrl(canonicalUrl);
  const key = hashString(canonicalUrl).toString(36);
  const creator = importedCreatorFromUrl(canonicalUrl, platform, key);
  const rng = mulberry32(hashString(`video:${canonicalUrl}`));
  const days = options.days ?? 30;
  const today = utcMidnight(new Date());
  const ageDays = randInt(rng, 1, Math.max(1, days - 1));
  const uploadDate = addDays(today, -ageDays);
  const finalViews = sampleFinalViews(rng);
  const daily = buildVideoSeries(rng, uploadDate, today, finalViews);

  return {
    platform,
    handle: creator.handle,
    displayName: creator.displayName,
    avatarUrl: `/sample-avatar.svg`,
    videos: [
      {
        caption: makeCaption(rng),
        thumbnailUrl: `/sample-video.svg`,
        url: canonicalUrl,
        uploadDate,
        daily,
      },
    ],
  };
}

/**
 * Core synthetic generator. Used by both the MockDataSource adapter and the
 * database seed script so the prototype's data is internally consistent.
 */
export function generateAccount(
  platform: Platform,
  handle: string,
  options: GenerateAccountOptions = {}
): ScrapedAccount {
  const days = options.days ?? 30;
  const maxVideos = options.maxVideos ?? randInt(mulberry32(hashString(handle)), 18, 42);
  const rng = mulberry32(hashString(`${platform}:${handle}:${options.seedSuffix ?? ""}`));

  const today = utcMidnight(new Date());
  const windowStart = addDays(today, -days);

  const videos: ScrapedVideo[] = [];
  for (let i = 0; i < maxVideos; i++) {
    // Upload date somewhere in the window (weighted toward more recent).
    const ageFraction = Math.pow(rng(), 0.7); // bias toward recent
    const uploadDate = addDays(
      windowStart,
      Math.floor(ageFraction * days)
    );
    const finalViews = sampleFinalViews(rng);
    const daily = buildVideoSeries(rng, uploadDate, today, finalViews);
    videos.push({
      caption: makeCaption(rng),
      thumbnailUrl: `/sample-video.svg`,
      url: `https://${platform}.example/${handle}/video/${i}`,
      uploadDate,
      daily,
    });
  }

  return {
    platform,
    handle,
    displayName: handle,
    avatarUrl: `/sample-avatar.svg`,
    videos,
  };
}

export class MockDataSource implements DataSource {
  readonly name = "mock";

  async fetchAccount(
    platform: Platform,
    handle: string,
    options?: FetchAccountOptions
  ): Promise<ScrapedAccount> {
    const normalized = handle.replace(/^@/, "").trim();
    const plat: Platform = PLATFORMS.includes(platform) ? platform : "tiktok";
    // Simulate a tiny bit of network latency.
    await new Promise((r) => setTimeout(r, 50));
    return generateAccount(plat, normalized, options);
  }

  async fetchVideo(
    url: string,
    options?: FetchVideoOptions
  ): Promise<ScrapedAccount> {
    const normalized = url.trim();
    await new Promise((r) => setTimeout(r, 50));
    return generateVideoFromUrl(normalized, options);
  }
}
