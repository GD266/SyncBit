import { useCallback, useEffect, useRef, useState } from "react";

import { toAppError } from "../lib/errors";
import { downloadService } from "../services";
import type { DownloadTask } from "../types/download";
import type { MediaFormat } from "../types/media";

export type DownloadTaskPhase =
  | "idle"
  | "starting"
  | "downloading"
  | "completed"
  | "failed"
  | "cancelled";

export interface UseDownloadTaskResult {
  phase: DownloadTaskPhase;
  task: DownloadTask | null;
  message: string | null;
  start: (format: MediaFormat) => void;
  cancel: () => void;
  dismiss: () => void;
}

/**
 * Drives a single download task through the DownloadService. The UI only sees
 * this hook's state machine — never the low-level download implementation.
 */
export function useDownloadTask(
  sourceUrl: string,
  title: string,
): UseDownloadTaskResult {
  const [phase, setPhase] = useState<DownloadTaskPhase>("idle");
  const [task, setTask] = useState<DownloadTask | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const taskIdRef = useRef<string | null>(null);
  const startingRef = useRef(false);

  useEffect(() => {
    return downloadService.onTaskUpdate((update) => {
      if (taskIdRef.current === null || update.id !== taskIdRef.current) {
        return;
      }
      setTask(update);
      switch (update.status) {
        case "pending":
          setPhase("starting");
          setMessage(null);
          break;
        case "downloading":
          setPhase("downloading");
          setMessage(null);
          break;
        case "completed":
          setPhase("completed");
          setMessage(null);
          break;
        case "failed":
          setPhase("failed");
          setMessage(update.error?.message ?? "The download failed.");
          break;
        case "cancelled":
          setPhase("cancelled");
          setMessage(null);
          break;
      }
    });
  }, []);

  const start = useCallback(
    (format: MediaFormat) => {
      if (taskIdRef.current !== null || startingRef.current) {
        return;
      }
      startingRef.current = true;
      setPhase("starting");
      setMessage(null);

      void (async () => {
        try {
          const created = await downloadService.createTask(sourceUrl, title);
          taskIdRef.current = created.id;
          await downloadService.selectFormat(created.id, format);
          const started = await downloadService.start(created.id);
          setTask(started);
          setPhase("downloading");
        } catch (error) {
          const appError = toAppError(error);
          if (taskIdRef.current !== null) {
            const id = taskIdRef.current;
            taskIdRef.current = null;
            try {
              await downloadService.cleanup(id);
            } catch {
              // Best effort — the engine may already have dropped the task.
            }
          }
          setTask(null);
          setPhase("failed");
          setMessage(appError.message);
        } finally {
          startingRef.current = false;
        }
      })();
    },
    [sourceUrl, title],
  );

  const cancel = useCallback(() => {
    const id = taskIdRef.current;
    if (id === null) {
      return;
    }
    void downloadService.cancel(id).catch(() => {});
  }, []);

  const dismiss = useCallback(() => {
    const id = taskIdRef.current;
    if (id === null) {
      return;
    }
    taskIdRef.current = null;
    setPhase("idle");
    setTask(null);
    setMessage(null);
    void downloadService.cleanup(id).catch(() => {});
  }, []);

  return { phase, task, message, start, cancel, dismiss };
}