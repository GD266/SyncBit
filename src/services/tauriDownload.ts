import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import type { DownloadTask } from "../types/download";
import type { MediaFormat } from "../types/media";
import {
  DOWNLOAD_TASK_EVENT,
  type DownloadService,
  type DownloadTaskListener,
} from "./download";

/**
 * Tauri-backed download service. Maps the DownloadService contract onto the
 * Rust download engine commands and the `download://task` progress event.
 */
export class TauriDownloadService implements DownloadService {
  private readonly listeners = new Set<DownloadTaskListener>();
  private unlisten: UnlistenFn | null = null;
  private listenPromise: Promise<void> | null = null;

  createTask(sourceUrl: string, title: string): Promise<DownloadTask> {
    return invoke<DownloadTask>("create_download_task", { sourceUrl, title });
  }

  selectFormat(taskId: string, format: MediaFormat): Promise<DownloadTask> {
    return invoke<DownloadTask>("select_download_format", { taskId, format });
  }

  start(taskId: string): Promise<DownloadTask> {
    return invoke<DownloadTask>("start_download", { taskId });
  }

  cancel(taskId: string): Promise<DownloadTask> {
    return invoke<DownloadTask>("cancel_download", { taskId });
  }

  getTask(taskId: string): Promise<DownloadTask> {
    return invoke<DownloadTask>("get_download_task", { taskId });
  }

  cleanup(taskId: string): Promise<void> {
    return invoke<void>("cleanup_download", { taskId });
  }

  onTaskUpdate(listener: DownloadTaskListener): () => void {
    this.listeners.add(listener);
    this.ensureListening();
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.listeners.clear();
    this.unlisten?.();
    this.unlisten = null;
    this.listenPromise = null;
  }

  private ensureListening(): void {
    if (this.listenPromise !== null) {
      return;
    }
    this.listenPromise = listen<DownloadTask>(DOWNLOAD_TASK_EVENT, (event) => {
      for (const listener of this.listeners) {
        listener(event.payload);
      }
    })
      .then((unlisten) => {
        this.unlisten = unlisten;
      })
      .catch(() => {
        this.listenPromise = null;
      });
  }
}