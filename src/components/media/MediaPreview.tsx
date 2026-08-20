import { useState, type ChangeEvent } from "react";

import { formatDuration } from "../../lib/utils/format";
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

  const selectedFormat =
    metadata.formats.find((format) => format.id === selectedFormatId) ??
    metadata.formats[0] ??
    null;

  const duration =
    metadata.durationSeconds !== null && metadata.durationSeconds > 0
      ? formatDuration(metadata.durationSeconds)
      : null;

  function handleFormatChange(event: ChangeEvent<HTMLSelectElement>) {
    setSelectedFormatId(event.target.value);
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
            disabled={metadata.formats.length === 0}
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

        <div className="media-preview__actions">
          <Button
            variant="primary"
            disabled
            title="Downloads are not available yet"
          >
            {selectedFormat !== null
              ? `Download ${selectedFormat.quality}`
              : "Download"}
          </Button>
        </div>
        <p className="media-preview__note">
          Downloads aren&apos;t wired up yet — your chosen format is ready for
          when they arrive.
        </p>
      </div>
    </Panel>
  );
}