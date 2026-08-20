export const ErrorCode = {
  Unknown: "unknown",
  ConfigError: "config_error",
  BackendError: "backend_error",
  InvokeFailed: "invoke_failed",
  InvalidUrl: "invalid_url",
  UnsupportedUrl: "unsupported_url",
  UnsupportedProvider: "unsupported_provider",
  UnauthorizedContent: "unauthorized_content",
  MetadataError: "metadata_error",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface AppErrorPayload {
  code: string;
  message: string;
}

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

const KNOWN_CODES: ReadonlySet<string> = new Set(Object.values(ErrorCode));

export function isAppErrorPayload(value: unknown): value is AppErrorPayload {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.code === "string" && typeof candidate.message === "string";
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (isAppErrorPayload(error)) {
    const code = KNOWN_CODES.has(error.code)
      ? (error.code as ErrorCode)
      : ErrorCode.BackendError;
    return new AppError(code, error.message, error);
  }
  if (error instanceof Error) {
    return new AppError(ErrorCode.Unknown, error.message, error);
  }
  return new AppError(ErrorCode.Unknown, String(error), error);
}

export function errorMessage(error: unknown): string {
  return toAppError(error).message;
}
