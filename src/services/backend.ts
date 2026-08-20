import { invoke } from "@tauri-apps/api/core";

import type { AppInfo } from "../types/app";

export const backend = {
  getAppInfo(): Promise<AppInfo> {
    return invoke<AppInfo>("get_app_info");
  },
};