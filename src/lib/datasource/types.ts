import type { Platform } from "@/lib/constants";

export type MetricName = "views" | "likes" | "comments" | "shares" | "saves";

// A single day's cumulative snapshot of a video's metrics.
export interface ScrapedMetricPoint {
  date: Date; // UTC midnight for the day
  capturedAt?: Date; // Full observation time, separate from the daily snapshot key.
  views: number; // cumulative total views as of this day
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  // A false value means the provider could not expose this metric. Persistence
  // must not replace a previously known count with a fabricated zero.
  observed?: Partial<Record<MetricName, boolean>>;
}

export type BatchVideoMetricStatus = "ok" | "not_found" | "unsupported" | "error";

export interface BatchVideoMetricResult {
  url: string;
  status: BatchVideoMetricStatus;
  platform?: Platform;
  metric?: ScrapedMetricPoint;
  error?: string;
  requestId?: string;
}

export interface ScrapedVideo {
  caption: string;
  thumbnailUrl: string;
  url: string;
  uploadDate: Date;
  // Historical cumulative snapshots when a source provides them.
  daily: ScrapedMetricPoint[];
  // Current cumulative totals as of a scraper/import run. Weekly refreshes
  // should update this field, not create fake historical trend points.
  current?: ScrapedMetricPoint;
}

export interface ScrapedAccount {
  platform: Platform;
  handle: string;
  displayName: string;
  avatarUrl: string;
  videos: ScrapedVideo[];
}

export interface FetchAccountOptions {
  // How many videos to pull (most-recent first). Defaults to a sensible value.
  maxVideos?: number;
  // History window in days. Defaults to 30.
  days?: number;
}

export interface FetchVideoOptions {
  // History window in days. Defaults to 30.
  days?: number;
}

/**
 * The seam between the app and "where the numbers come from".
 *
 * The whole product reads/writes through this interface, so swapping the
 * synthetic MockDataSource for a real provider (the SocialCrawl adapter)
 * is a single wiring change in ./index.ts — no callers change.
 */
export interface DataSource {
  readonly name: string;
  readonly maxBatchSize?: number;
  fetchAccount(
    platform: Platform,
    handle: string,
    options?: FetchAccountOptions
  ): Promise<ScrapedAccount>;
  fetchVideo(url: string, options?: FetchVideoOptions): Promise<ScrapedAccount>;
  fetchVideoMetricsBatch?(urls: string[]): Promise<BatchVideoMetricResult[]>;
}
