import { useEffect, useState } from "react";

import { toAppError } from "../lib/errors";
import { backend } from "../services/backend";
import type { AppInfo } from "../types/app";

export interface AppInfoState {
  status: "loading" | "ready" | "error";
  info: AppInfo | null;
  message: string | null;
}

export function useAppInfo(): AppInfoState {
  const [state, setState] = useState<AppInfoState>({
    status: "loading",
    info: null,
    message: null,
  });

  useEffect(() => {
    let active = true;

    backend
      .getAppInfo()
      .then((info) => {
        if (active) {
          setState({ status: "ready", info, message: null });
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState({ status: "error", info: null, message: toAppError(error).message });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return state;
}