import { useState, type ChangeEvent } from "react";

import { useDownloadTask } from "../../hooks/useDownloadTask";
import {
  formatBytes,
  formatDuration,
  formatEta,
  formatSpeed,
} from "../../lib/utils/format";
import type { MediaMetadata } from "../../types/media";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import "./MediaPreview.css";

export interface MediaPreviewProps {
  metadata: MediaMetadata;
}

export function MediaPreview({ metadata }: MediaPreviewProps) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [selectedFormatId, setSelectedFormatId] = useState(
    () => metadata.formats[0]?.id ?? "",
  );
  const download = useDownloadTask(metadata.sourceUrl, metadata.title);

  const selectedFormat =
    metadata.formats.find((format) => format.id === selectedFormatId) ??
    metadata.formats[0] ??
    null;

  const duration =
    metadata.durationSeconds !== null && metadata.durationSeconds > 0
      ? formatDuration(metadata.durationSeconds)
      : null;

  const { phase, task } = download;
  const progressPercent =
    task?.progress !== null && task?.progress !== undefined
      ? Math.round(Math.min(1, Math.max(0, task.progress)) * 100)
      : null;

  function handleFormatChange(event: ChangeEvent<HTMLSelectElement>) {
    setSelectedFormatId(event.target.value);
  }

  function handleDownloadClick() {
    if (selectedFormat !== null) {
      download.start(selectedFormat);
    }
  }

  return (
    <Panel className="media-preview">
      <div className="media-preview__thumb">
        {metadata.thumbnail !== null && !thumbnailFailed ? (
          <img
            src={metadata.thumbnail}
            alt=""
            loading="lazy"
            onError={() => setThumbnailFailed(true)}
          />
        ) : (
          <div className="media-preview__thumb-fallback">SyncBit</div>
        )}
        {duration !== null && (
          <span className="media-preview__duration">{duration}</span>
        )}
      </div>

      <div className="media-preview__body">
        <p className="media-preview__provider">YouTube</p>
        <h2 className="media-preview__title">{metadata.title}</h2>
        <p className="media-preview__meta">
          {metadata.uploader ?? "Unknown uploader"}
        </p>

        <div className="media-preview__formats">
          <label className="media-preview__format-label" htmlFor="media-format">
            Format
          </label>
          <select
            id="media-format"
            className="media-preview__select"
            value={selectedFormat?.id ?? ""}
            disabled={metadata.formats.length === 0 || phase !== "idle"}
            onChange={handleFormatChange}
          >
            {metadata.formats.length === 0 ? (
              <option value="">No formats available</option>
            ) : (
              metadata.formats.map((format) => (
                <option key={format.id} value={format.id}>
                  {format.label}
                  {format.note !== null ? ` — ${format.note}` : ""}
                </option>
              ))
            )}
          </select>
        </div>

        {phase === "downloading" && task !== null && (
          <div className="media-preview__download" aria-live="polite">
            <div
              className={
                progressPercent !== null
                  ? "media-preview__progress"
                  : "media-preview__progress media-preview__progress--indeterminate"
              }
              role="progressbar"
              aria-label="Download progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent ?? undefined}
            >
              <div
                className="media-preview__progress-fill"
                style={
                  progressPercent !== null
                    ? { width: `${progressPercent}%` }
                    : undefined
                }
              />
            </div>
            <div className="media-preview__download-meta">
              <span>
                {progressPercent !== null
                  ? `${progressPercent}%`
                  : "Downloading…"}
              </span>
              {task.totalBytes !== null && (
                <span>
                  {formatBytes(task.downloadedBytes ?? 0)} /{" "}
                  {formatBytes(task.totalBytes)}
                </span>
              )}
              {task.speedBytesPerSecond !== null && (
                <span>{formatSpeed(task.speedBytesPerSecond)}</span>
              )}
              {task.etaSeconds !== null && (
                <span>{formatEta(task.etaSeconds)} left</span>
              )}
            </div>
          </div>
        )}

        <div className="media-preview__actions">
          {phase === "idle" && (
            <Button
              variant="primary"
              disabled={selectedFormat === null}
              onClick={handleDownloadClick}
            >
              {selectedFormat !== null
                ? `Download ${selectedFormat.quality}`
                : "Download"}
            </Button>
          )}
          {phase === "starting" && (
            <Button variant="primary" loading disabled>
              Starting…
            </Button>
          )}
          {phase === "downloading" && (
            <Button variant="secondary" onClick={download.cancel}>
              Cancel
            </Button>
          )}
          {(phase === "completed" ||
            phase === "failed" ||
            phase === "cancelled") && (
            <Button variant="secondary" onClick={download.dismiss}>
              Dismiss
            </Button>
          )}
        </div>

        {phase === "completed" && task !== null && task.outputPath !== null && (
          <p className="media-preview__note">Saved to {task.outputPath}</p>
        )}
        {phase === "failed" && download.message !== null && (
          <p className="media-preview__note">{download.message}</p>
        )}
        {phase === "cancelled" && (
          <p className="media-preview__note">Download cancelled.</p>
        )}
      </div>
    </Panel>
  );
}