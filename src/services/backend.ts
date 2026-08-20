import { invoke } from "@tauri-apps/api/core";

import type { AppInfo } from "../types/app";
import type { MediaMetadata } from "../types/media";

export const backend = {
  getAppInfo(): Promise<AppInfo> {
    return invoke<AppInfo>("get_app_info");
  },

  fetchMediaMetadata(url: string): Promise<MediaMetadata> {
    return invoke<MediaMetadata>("fetch_media_metadata", { url });
  },
};