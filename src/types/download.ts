import type { MediaFormat } from "./media";

export type DownloadStatus =
  | "pending"
  | "downloading"
  | "completed"
  | "failed"
  | "cancelled";

export interface DownloadErrorInfo {
  code: string;
  message: string;
}

export interface DownloadTask {
  id: string;
  sourceUrl: string;
  title: string;
  format: MediaFormat | null;
  status: DownloadStatus;
  /** 0..1 when the total size is known, otherwise null. */
  progress: number | null;
  downloadedBytes: number | null;
  totalBytes: number | null;
  speedBytesPerSecond: number | null;
  etaSeconds: number | null;
  outputPath: string | null;
  error: DownloadErrorInfo | null;
}