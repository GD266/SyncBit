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

  const { phase, task, message } = download;
  const progressPercent =
    task?.progress !== null && task?.progress !== undefined
      ? Math.round(Math.min(1, Math.max(0, task.progress)) * 100)
      : null;

  const isActive = phase === "starting" || phase === "downloading";
  const isTerminal = phase === "completed" || phase === "failed" || phase === "cancelled";

  function handleFormatChange(event: ChangeEvent<HTMLSelectElement>) {
    setSelectedFormatId(event.target.value);
  }

  function handleDownloadClick() {
    if (selectedFormat !== null) {
      download.start(selectedFormat);
    }
  }

  function getStatusLabel(): string {
    switch (phase) {
      case "starting":
        return "Preparing…";
      case "downloading":
        return "Downloading";
      case "completed":
        return "Completed";
      case "failed":
        return "Failed";
      case "cancelled":
        return "Cancelled";
      default:
        return "";
    }
  }

  function formatDownloaded(): string {
    if (!task || task.downloadedBytes === null) {
      return "—";
    }
    return formatBytes(task.downloadedBytes);
  }

  function formatTotal(): string {
    if (!task || task.totalBytes === null) {
      return "—";
    }
    return formatBytes(task.totalBytes);
  }

  function formatSpeedDisplay(): string {
    if (!task || task.speedBytesPerSecond === null) {
      return "—";
    }
    return formatSpeed(task.speedBytesPerSecond);
  }

  function formatEtaDisplay(): string {
    if (!task || task.etaSeconds === null) {
      return "—";
    }
    return formatEta(task.etaSeconds);
  }

  return (
    <Panel className="media-preview" role="region" aria-label="Download progress">
      <div className="media-preview__thumb">
        {metadata.thumbnail !== null && !thumbnailFailed ? (
          <img
            src={metadata.thumbnail}
            alt=""
            loading="lazy"
            onError={() => setThumbnailFailed(true)}
          />
        ) : (
          <div className="media-preview__thumb-fallback">GrabAClip</div>
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

        {isActive && task !== null && (
          <div className="media-preview__download" aria-live="polite" aria-busy="true">
            <div className="media-preview__download-header">
              <span className="media-preview__status">
                {getStatusLabel()}
              </span>
              <span
                className="media-preview__progress-percent"
                aria-live="off"
              >
                {progressPercent !== null ? `${progressPercent}%` : "—"}
              </span>
            </div>

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

            <dl className="media-preview__details">
              <div className="media-preview__detail">
                <dt>Downloaded</dt>
                <dd>{formatDownloaded()}</dd>
              </div>
              <div className="media-preview__detail">
                <dt>Total</dt>
                <dd>{formatTotal()}</dd>
              </div>
              <div className="media-preview__detail">
                <dt>Speed</dt>
                <dd>{formatSpeedDisplay()}</dd>
              </div>
              <div className="media-preview__detail">
                <dt>Remaining</dt>
                <dd>{formatEtaDisplay()}</dd>
              </div>
            </dl>
          </div>
        )}

        {phase === "completed" && task !== null && (
          <div className="media-preview__download media-preview__download--completed" aria-live="polite">
            <div className="media-preview__download-header">
              <span className="media-preview__status media-preview__status--completed">
                Completed
              </span>
              <span className="media-preview__progress-percent">100%</span>
            </div>
            <div className="media-preview__progress media-preview__progress--completed">
              <div className="media-preview__progress-fill" style={{ width: "100%" }} />
            </div>
            <dl className="media-preview__details">
              <div className="media-preview__detail">
                <dt>Saved</dt>
                <dd>{formatBytes(task.downloadedBytes ?? 0)}</dd>
              </div>
              {task.outputPath !== null && (
                <div className="media-preview__detail media-preview__detail--path">
                  <dt>Location</dt>
                  <dd title={task.outputPath}>{task.outputPath}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {phase === "failed" && (
          <div className="media-preview__download media-preview__download--failed" aria-live="assertive">
            <div className="media-preview__download-header">
              <span className="media-preview__status media-preview__status--failed">
                Failed
              </span>
            </div>
            {message && (
              <p className="media-preview__error">{message}</p>
            )}
          </div>
        )}

        {phase === "cancelled" && (
          <div className="media-preview__download media-preview__download--cancelled" aria-live="polite">
            <div className="media-preview__download-header">
              <span className="media-preview__status media-preview__status--cancelled">
                Cancelled
              </span>
            </div>
            <p className="media-preview__error">Download cancelled.</p>
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
          {isTerminal && (
            <Button variant="secondary" onClick={download.dismiss}>
              Dismiss
            </Button>
          )}
        </div>
      </div>
    </Panel>
  );
}