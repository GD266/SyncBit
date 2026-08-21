import { AppError, ErrorCode } from "../lib/errors";

export type AppEnvironment = "development" | "production";

export interface AppEnv {
  readonly name: string;
  readonly environment: AppEnvironment;
  readonly version: string | null;
}

const DEFAULT_APP_NAME = "GrabAClip";

function loadAppEnv(): AppEnv {
  const rawEnvironment = import.meta.env.VITE_APP_ENV?.trim() || "production";
  if (rawEnvironment !== "development" && rawEnvironment !== "production") {
    throw new AppError(
      ErrorCode.ConfigError,
      `VITE_APP_ENV must be "development" or "production", got "${rawEnvironment}".`,
    );
  }

  return {
    name: import.meta.env.VITE_APP_NAME?.trim() || DEFAULT_APP_NAME,
    environment: rawEnvironment,
    version: import.meta.env.VITE_APP_VERSION?.trim() || null,
  };
}

export const appEnv: AppEnv = loadAppEnv();