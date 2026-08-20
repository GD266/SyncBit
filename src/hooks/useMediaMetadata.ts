import { useCallback, useRef, useState } from "react";

import { toAppError } from "../lib/errors";
import { backend } from "../services/backend";
import type { MediaMetadata } from "../types/media";

export type MediaMetadataStatus = "idle" | "loading" | "ready" | "error";

export interface MediaMetadataState {
  status: MediaMetadataStatus;
  metadata: MediaMetadata | null;
  message: string | null;
}

export interface UseMediaMetadataResult extends MediaMetadataState {
  load: (url: string) => void;
  reset: () => void;
}

export function useMediaMetadata(): UseMediaMetadataResult {
  const [state, setState] = useState<MediaMetadataState>({
    status: "idle",
    metadata: null,
    message: null,
  });
  const requestRef = useRef(0);

  const load = useCallback((url: string) => {
    const requestId = ++requestRef.current;
    setState({ status: "loading", metadata: null, message: null });

    backend
      .fetchMediaMetadata(url)
      .then((metadata) => {
        if (requestRef.current === requestId) {
          setState({ status: "ready", metadata, message: null });
        }
      })
      .catch((error: unknown) => {
        if (requestRef.current === requestId) {
          setState({ status: "error", metadata: null, message: toAppError(error).message });
        }
      });
  }, []);

  const reset = useCallback(() => {
    requestRef.current += 1;
    setState({ status: "idle", metadata: null, message: null });
  }, []);

  return { ...state, load, reset };
}