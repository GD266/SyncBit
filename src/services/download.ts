import type { DownloadTask } from "../types/download";
import type { MediaFormat } from "../types/media";

/** Tauri event emitted by the engine on every task state change. */
export const DOWNLOAD_TASK_EVENT = "download://task";

export type DownloadTaskListener = (task: DownloadTask) => void;

/**
 * High-level contract between the UI and the download engine.
 *
 * The UI never touches the low-level download implementation: it creates a
 * task, selects one of the formats the authorized metadata fetch offered,
 * starts it, and reacts to task updates. The engine owns all streaming,
 * cancellation and file handling.
 */
export interface DownloadService {
  createTask(sourceUrl: string, title: string): Promise<DownloadTask>;
  selectFormat(taskId: string, format: MediaFormat): Promise<DownloadTask>;
  start(taskId: string): Promise<DownloadTask>;
  cancel(taskId: string): Promise<DownloadTask>;
  getTask(taskId: string): Promise<DownloadTask>;
  cleanup(taskId: string): Promise<void>;
  /** Subscribes to task updates. Returns an unsubscribe function. */
  onTaskUpdate(listener: DownloadTaskListener): () => void;
  dispose(): void;
}