import { parseOptionalString } from "@/lib/api";
import { getDataSource } from "@/lib/datasource";
import { MockDataSource } from "@/lib/datasource/mock";
import { YouTubeDataSource } from "@/lib/datasource/youtube";
import { canonicalSocialUrl } from "@/lib/datasource/socialcrawl";
import { AppError, badRequest } from "@/lib/errors";
import { ingestAccount } from "@/lib/ingest";

const ALLOWED_VIDEO_HOSTS = [
  "tiktok.com",
  "vm.tiktok.com",
  "instagram.com",
  "youtube.com",
  "youtu.be",
  "facebook.com",
  "fb.watch",
  "snapchat.com",
  "x.com",
  "twitter.com",
];

export interface TrackVideoRequestInput {
  videoUrl: string;
  collectionId: string | null;
}

export interface TrackVideosRequestInput {
  videos: TrackVideoRequestInput[];
  collectionId: string | null;
  concurrency: number;
}

const MAX_BULK_VIDEO_IMPORTS = 250;
const DEFAULT_IMPORT_CONCURRENCY = 4;
const MAX_IMPORT_CONCURRENCY = 8;

export function parseTrackVideoRequestBody(
  body: Record<string, unknown>
): TrackVideoRequestInput {
  const rawUrl = parseOptionalString(body.videoUrl) ?? parseOptionalString(body.url);
  const collectionId = parseOptionalString(body.collectionId);

  if (!rawUrl) throw badRequest("videoUrl is required");
  let videoUrl: string;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") throw new Error("Unsupported protocol");
    if (!isAllowedVideoHost(parsed.hostname)) throw new Error("Unsupported host");
    videoUrl = parsed.toString();
  } catch {
    throw badRequest("Enter a valid TikTok, Instagram, YouTube, Facebook, Snapchat, or X video URL");
  }

  return { videoUrl, collectionId };
}

export function parseTrackVideosRequestBody(
  body: Record<string, unknown>
): TrackVideosRequestInput {
  const collectionId = parseOptionalString(body.collectionId);
  const rawUrls = rawVideoUrls(body);
  if (rawUrls.length === 0) throw badRequest("At least one video URL is required");

  const byUrl = new Map<string, TrackVideoRequestInput>();
  for (const rawUrl of rawUrls) {
    const parsed = parseTrackVideoRequestBody({ videoUrl: rawUrl, collectionId });
    byUrl.set(parsed.videoUrl, parsed);
  }

  const videos = Array.from(byUrl.values());
  if (videos.length > MAX_BULK_VIDEO_IMPORTS) {
    throw badRequest(`Import up to ${MAX_BULK_VIDEO_IMPORTS} videos at a time`);
  }

  return {
    videos,
    collectionId,
    concurrency: importConcurrency(body.concurrency),
  };
}

function rawVideoUrls(body: Record<string, unknown>): string[] {
  const candidates =
    Array.isArray(body.videoUrls)
      ? body.videoUrls
      : Array.isArray(body.urls)
        ? body.urls
        : [body.videoUrl ?? body.url];

  return candidates
    .flatMap((value) =>
      typeof value === "string" ? value.split(/\r?\n/) : []
    )
    .map((value) => value.trim())
    .filter(Boolean);
}

function importConcurrency(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number(process.env.TRACK_IMPORT_CONCURRENCY ?? DEFAULT_IMPORT_CONCURRENCY);
  if (!Number.isFinite(parsed)) return DEFAULT_IMPORT_CONCURRENCY;
  return Math.min(MAX_IMPORT_CONCURRENCY, Math.max(1, Math.round(parsed)));
}

function isAllowedVideoHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^www\./, "");
  return ALLOWED_VIDEO_HOSTS.some(
    (host) => normalized === host || normalized.endsWith(`.${host}`)
  );
}

export function trackVideoUrlLookupVariants(videoUrl: string): string[] {
  const variants = new Set<string>();
  try {
    const url = new URL(videoUrl);
    variants.add(url.toString());
    variants.add(canonicalSocialUrl(videoUrl));

    const noHash = new URL(url);
    noHash.hash = "";
    variants.add(noHash.toString());

    const noSearch = new URL(noHash);
    noSearch.search = "";
    variants.add(noSearch.toString());

    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    const parts = url.pathname.split("/").filter(Boolean);

    if (host === "tiktok.com" && ["video", "photo"].includes(parts[1]) && /^\d+$/.test(parts[2] ?? "")) {
      for (const domain of ["www.tiktok.com", "tiktok.com", "m.tiktok.com"]) {
        for (const kind of ["video", "photo"]) {
          for (const suffix of ["", "/"]) variants.add(`https://${domain}/${parts[0]}/${kind}/${parts[2]}${suffix}`);
        }
      }
    }

    if (host === "instagram.com" || host.endsWith(".instagram.com")) {
      const shortcode = parts[0] === "reels" || parts[0] === "reel" ? parts[1] : null;
      if (shortcode) {
        variants.add(`https://www.instagram.com/reel/${shortcode}/`);
        variants.add(`https://instagram.com/reel/${shortcode}/`);
      }
    }

    const youtubeId = youtubeVideoIdFromUrl(url);
    if (youtubeId) {
      variants.add(`https://www.youtube.com/watch?v=${youtubeId}`);
      variants.add(`https://youtube.com/watch?v=${youtubeId}`);
      variants.add(`https://youtu.be/${youtubeId}`);
    }
  } catch {
    variants.add(videoUrl.trim());
  }

  return Array.from(variants).filter(Boolean);
}

function youtubeVideoIdFromUrl(url: URL): string | null {
  const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  if (host === "youtu.be") return parts[0] ?? null;
  if (host === "youtube.com" || host.endsWith(".youtube.com")) {
    if (url.pathname === "/watch") return url.searchParams.get("v");
    if (["shorts", "embed", "live"].includes(parts[0] ?? "")) return parts[1] ?? null;
  }
  return null;
}

export async function fetchTrackedVideo(
  input: TrackVideoRequestInput,
  options: { days?: number } = {}
) {
  const source = getDataSourceForVideoUrl(input.videoUrl);
  let effectiveSource = source;
  let scraped;

  try {
    scraped = await source.fetchVideo(input.videoUrl, {
      days: options.days ?? 30,
    });
  } catch (err) {
    if (!shouldFallbackToMockVideoSource(source.name, err)) throw err;

    effectiveSource = new MockDataSource();
    scraped = await effectiveSource.fetchVideo(input.videoUrl, {
      days: options.days ?? 30,
    });
  }

  return { source: effectiveSource, scraped };
}

export async function trackVideoForOrg(
  organisationId: string,
  input: TrackVideoRequestInput,
  options: { days?: number; skipCollectionAssert?: boolean } = {}
) {
  const { source, scraped } = await fetchTrackedVideo(input, options);
  const result = await ingestAccount(organisationId, scraped, {
    collectionId: input.collectionId,
    metricSource: source.name,
    skipCollectionAssert: options.skipCollectionAssert,
  });

  return { source, scraped, result, video: scraped.videos[0] ?? null };
}

function shouldFallbackToMockVideoSource(sourceName: string, err: unknown) {
  if (sourceName !== "apify") return false;
  if (process.env.ALLOW_MOCK_IMPORT_FALLBACK !== "true") return false;
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_MOCK_IMPORT_FALLBACK !== "true"
  ) {
    return false;
  }

  if (err instanceof AppError && err.status === 503) return true;

  const message = err instanceof Error ? err.message : String(err);
  return /real video scraping is not configured|missing apify/i.test(message);
}

function getDataSourceForVideoUrl(videoUrl: string) {
  const configured = (process.env.DATA_SOURCE ?? "mock").toLowerCase();
  if (configured === "mock") return getDataSource();

  // The legacy Apify setup keeps its official YouTube Data API adapter.
  // SocialCrawl handles YouTube through the same provider as every other platform.
  if (configured === "apify" && isYouTubeHost(new URL(videoUrl).hostname)) {
    return new YouTubeDataSource();
  }

  return getDataSource();
}

function isYouTubeHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  return normalized === "youtube.com" || normalized.endsWith(".youtube.com") || normalized === "youtu.be";
}
