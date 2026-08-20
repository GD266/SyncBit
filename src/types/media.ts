export type MediaProviderId = "youtube";

export interface MediaFormat {
  id: string;
  label: string;
  quality: string;
  container: string;
  extension: string;
  width: number | null;
  height: number | null;
  note: string | null;
}

export interface MediaMetadata {
  provider: MediaProviderId;
  id: string;
  sourceUrl: string;
  title: string;
  thumbnail: string | null;
  durationSeconds: number | null;
  uploader: string | null;
  uploaderUrl: string | null;
  formats: MediaFormat[];
}