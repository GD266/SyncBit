import { AppError, ErrorCode } from "./errors";
import type { MediaProviderId } from "../types/media";

export const MAX_URL_LENGTH = 2048;

export const SUPPORTED_HOSTS = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "music.youtube.com",
  "youtube-nocookie.com",
] as const;

const SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;
const YOUTUBE_VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_PATH_KINDS = ["shorts", "live", "embed", "v"] as const;

export interface ParsedMediaUrl {
  normalized: string;
  canonical: string;
  provider: MediaProviderId;
  videoId: string;
}

export function normalizeUrlInput(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || SCHEME_PATTERN.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export function parseMediaUrl(raw: string): ParsedMediaUrl {
  const normalized = normalizeUrlInput(raw);
  if (normalized.length === 0) {
    throw new AppError(ErrorCode.InvalidUrl, "Enter a URL to continue.");
  }
  if (normalized.length > MAX_URL_LENGTH) {
    throw new AppError(
      ErrorCode.InvalidUrl,
      `URLs must be ${MAX_URL_LENGTH} characters or fewer.`,
    );
  }

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    throw new AppError(ErrorCode.InvalidUrl, "That doesn't look like a valid URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AppError(
      ErrorCode.UnsupportedUrl,
      "Only http:// and https:// links are supported.",
    );
  }

  if (url.username !== "" || url.password !== "") {
    throw new AppError(
      ErrorCode.InvalidUrl,
      "Links containing embedded credentials are not allowed.",
    );
  }

  const host = url.hostname.toLowerCase();
  if (!SUPPORTED_HOSTS.includes(host as (typeof SUPPORTED_HOSTS)[number])) {
    throw new AppError(
      ErrorCode.UnsupportedProvider,
      `SyncBit does not support "${host}" yet. Supported hosts: ${SUPPORTED_HOSTS.join(", ")}.`,
    );
  }

  const videoId = extractYouTubeVideoId(url);
  if (videoId === null) {
    throw new AppError(ErrorCode.UnsupportedUrl, "That link does not point to a video.");
  }

  return {
    normalized: url.toString(),
    canonical: `https://www.youtube.com/watch?v=${videoId}`,
    provider: "youtube",
    videoId,
  };
}

function extractYouTubeVideoId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  const path = url.pathname;

  if (host === "youtu.be") {
    const rest = path.slice(1);
    if (rest.length === 0 || rest.includes("/")) {
      return null;
    }
    return YOUTUBE_VIDEO_ID_PATTERN.test(rest) ? rest : null;
  }

  const segments = path.split("/").filter(Boolean);
  let candidate: string | null = null;
  if (segments.length === 1 && segments[0] === "watch") {
    candidate = url.searchParams.get("v");
  } else if (
    segments.length === 2 &&
    YOUTUBE_PATH_KINDS.includes(segments[0] as (typeof YOUTUBE_PATH_KINDS)[number])
  ) {
    candidate = segments[1];
  }
  if (candidate === null || !YOUTUBE_VIDEO_ID_PATTERN.test(candidate)) {
    return null;
  }
  return candidate;
}