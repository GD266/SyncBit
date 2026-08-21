import type { MediaMetadata, MediaFormat } from "../types/media";

const YOUTUBE_HOSTS = [
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "music.youtube.com",
  "youtube-nocookie.com",
];

const WATCH_URL = "https://www.youtube.com/watch";
const PLAYER_RESPONSE_MARKER = "ytInitialPlayerResponse";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

interface PlayerResponse {
  playabilityStatus?: PlayabilityStatus;
  videoDetails?: VideoDetails;
  streamingData?: StreamingData;
}

interface PlayabilityStatus {
  status?: string;
  reason?: string;
}

interface VideoDetails {
  videoId: string;
  title: string;
  lengthSeconds?: string;
  author?: string;
  channelId?: string;
  ownerChannelName?: string;
  thumbnail?: Thumbnail;
}

interface Thumbnail {
  thumbnails: ThumbnailItem[];
}

interface ThumbnailItem {
  url: string;
}

interface StreamingData {
  formats: StreamFormat[];
}

interface StreamFormat {
  itag?: number;
  url?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  qualityLabel?: string;
  fps?: number;
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`YouTube returned HTTP ${response.status}`);
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
    throw new Error("response exceeds size limit");
  }
  return response.text();
}

function parsePlayerResponse(body: string): PlayerResponse | null {
  const markerIndex = body.indexOf(PLAYER_RESPONSE_MARKER);
  if (markerIndex === -1) return null;
  let start = body.indexOf("{", markerIndex + PLAYER_RESPONSE_MARKER.length);
  if (start === -1) return null;
  const end = findMatchingBrace(body, start);
  if (end === null) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as PlayerResponse;
  } catch {
    return null;
  }
}

function findMatchingBrace(body: string, start: number): number | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < body.length; i++) {
    const char = body[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
    } else {
      if (char === "{") {
        depth++;
      } else if (char === "}") {
        depth--;
        if (depth === 0) return i;
      } else if (char === '"') {
        inString = true;
      }
    }
  }
  return null;
}

function extractVideoId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  const path = url.pathname;

  if (host === "youtu.be") {
    const rest = path.slice(1);
    if (rest && !rest.includes("/") && isValidVideoId(rest)) {
      return rest;
    }
    return null;
  }

  if (!YOUTUBE_HOSTS.includes(host)) return null;

  const segments = path.split("/").filter(Boolean);
  if (segments[0] === "watch") {
    const v = url.searchParams.get("v");
    if (v && isValidVideoId(v)) return v;
    return null;
  }
  if (segments.length === 2 && ["shorts", "live", "embed", "v"].includes(segments[0])) {
    if (isValidVideoId(segments[1])) return segments[1];
    return null;
  }
  return null;
}

function isValidVideoId(id: string): boolean {
  return (
    id.length === 11 &&
    /^[a-zA-Z0-9_-]+$/.test(id)
  );
}

function buildAuthorizedFormats(formats: StreamFormat[]): MediaFormat[] {
  const seen = new Set<number>();
  const result: MediaFormat[] = [];
  for (const format of formats) {
    if (!format.itag) continue;
    if (seen.has(format.itag)) continue;
    const mimeType = format.mimeType;
    if (!mimeType) continue;
    const container = mimeContainer(mimeType);
    if (!container || !["mp4", "webm"].includes(container)) continue;
    if (!format.height) continue;
    const quality = format.qualityLabel || `${format.height}p`;
    const note = format.fps ? `${format.fps} fps` : null;
    seen.add(format.itag);
    result.push({
      id: format.itag.toString(),
      label: `${quality} · ${container.toUpperCase()}`,
      quality,
      container,
      extension: container,
      width: format.width ?? null,
      height: format.height,
      note,
    });
  }
  return result;
}

function mimeContainer(mimeType: string): string | null {
  const kind = mimeType.split(";")[0];
  const parts = kind.split("/");
  if (parts[0] === "video") return parts[1] ?? null;
  return null;
}

export async function fetchYouTubeMetadata(rawUrl: string): Promise<MediaMetadata> {
  const url = new URL(rawUrl);
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error("not a valid YouTube video URL");
  }

  const html = await fetchHtml(`${WATCH_URL}?v=${videoId}`);
  const player = parsePlayerResponse(html);
  if (!player) {
    throw new Error("video metadata is not publicly available");
  }
  if (player.playabilityStatus?.status !== "OK") {
    throw new Error(
      player.playabilityStatus?.reason || "video is not publicly playable"
    );
  }
  if (!player.videoDetails) {
    throw new Error("player response is missing video details");
  }

  const details = player.videoDetails;
  const durationSeconds = details.lengthSeconds
    ? parseInt(details.lengthSeconds, 10)
    : null;
  const uploader = details.ownerChannelName || details.author || null;
  const uploaderUrl = details.channelId
    ? `https://www.youtube.com/channel/${details.channelId}`
    : null;
  const thumbnail =
    details.thumbnail?.thumbnails?.[details.thumbnail.thumbnails.length - 1]?.url ??
    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  const formats = player.streamingData
    ? buildAuthorizedFormats(player.streamingData.formats)
    : [];

  return {
    provider: "youtube",
    id: videoId,
    sourceUrl: `${WATCH_URL}?v=${videoId}`,
    title: details.title,
    thumbnail,
    durationSeconds,
    uploader,
    uploaderUrl,
    formats,
  };
}

export async function resolveYouTubeDownloadUrl(
  rawUrl: string,
  formatId: string
): Promise<string> {
  const url = new URL(rawUrl);
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error("not a valid YouTube video URL");
  }

  const html = await fetchHtml(`${WATCH_URL}?v=${videoId}`);
  const player = parsePlayerResponse(html);
  if (!player) {
    throw new Error("video metadata is not publicly available");
  }
  if (!player.streamingData) {
    throw new Error("player response is missing streaming data");
  }
  const format = player.streamingData.formats.find(
    (f) => f.itag?.toString() === formatId
  );
  if (!format?.url) {
    throw new Error(`format not found: ${formatId}`);
  }
  return format.url;
}