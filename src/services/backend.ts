import type { AppInfo } from "../types/app";
import type { MediaMetadata } from "../types/media";

function isTauri(): boolean {
  return typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
}

function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return "";
  }
  return "";
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

async function webFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const response = await fetch(`${baseUrl}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    ...options,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  return response.json();
}

export const backend = {
  async getAppInfo(): Promise<AppInfo> {
    if (isTauri()) {
      return tauriInvoke<AppInfo>("get_app_info");
    }
    return webFetch<AppInfo>("/api/get-app-info");
  },

  async fetchMediaMetadata(url: string): Promise<MediaMetadata> {
    if (isTauri()) {
      return tauriInvoke<MediaMetadata>("fetch_media_metadata", { url });
    }
    return webFetch<MediaMetadata>("/api/fetch-metadata", {
      method: "POST",
      body: JSON.stringify({ url }),
    });
  },
};