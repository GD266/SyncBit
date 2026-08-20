import { TauriDownloadService } from "./tauriDownload";
import type { DownloadService, DownloadTaskListener } from "./download";

export { DOWNLOAD_TASK_EVENT } from "./download";
export type { DownloadService, DownloadTaskListener };

export const downloadService: DownloadService = new TauriDownloadService();