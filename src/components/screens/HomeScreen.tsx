import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { appEnv } from "../../config/env";
import { useAppInfo } from "../../hooks/useAppInfo";
import { useMediaMetadata } from "../../hooks/useMediaMetadata";
import { toAppError } from "../../lib/errors";
import { parseMediaUrl } from "../../lib/url";
import { MediaPreview } from "../media/MediaPreview";
import { AppHeader } from "../layout/AppHeader";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Panel } from "../ui/Panel";
import { Progress } from "../ui/Progress";
import "./HomeScreen.css";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable ||
    target.closest("input, textarea, [contenteditable]") !== null
  );
}

function modKey(): string {
  return /mac/i.test(navigator.platform ?? "") ? "⌘" : "Ctrl+";
}

export function HomeScreen() {
  const [value, setValue] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { status, info } = useAppInfo();
  const { status: mediaStatus, metadata, message, load, reset } =
    useMediaMetadata();

  const loading = mediaStatus === "loading";

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey;

      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }

      if (mod && event.key.toLowerCase() === "v") {
        if (isEditableTarget(event.target)) {
          return;
        }
        navigator.clipboard?.readText().then((text) => {
          if (text) {
            setValue(text);
            setInputError(null);
          }
        }).catch(() => {});
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      if (loading) {
        return;
      }
      const trimmed = value.trim();
      if (!trimmed) {
        inputRef.current?.focus();
        return;
      }
      let parsed;
      try {
        parsed = parseMediaUrl(trimmed);
      } catch (error) {
        setInputError(toAppError(error).message);
        inputRef.current?.focus();
        return;
      }
      setInputError(null);
      load(parsed.canonical);
    },
    [loading, value, load],
  );

  const backendLabel =
    status === "ready"
      ? "Backend connected"
      : status === "error"
        ? "Backend unreachable"
        : "Connecting to backend…";

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <AppHeader />

      <main id="main" className="home">
        <div className="home__inner">
          <section className="hero" aria-labelledby="hero-title">
            <p className="hero__eyebrow">GrabAClip</p>
            <h1 id="hero-title" className="hero__title">
              Download videos. Simply.
            </h1>
            <p className="hero__subtitle">
              Paste a video link and GrabAClip pulls its metadata — choose a
              format, and the download follows.
            </p>
          </section>

          <form className="fetch" onSubmit={handleSubmit} noValidate>
            <Input
              ref={inputRef}
              className="fetch__field"
              controlClassName="fetch__bar"
              label="Link"
              hint={`Press ${modKey()}K to focus`}
              placeholder="https://www.youtube.com/watch?v=…"
              type="url"
              autoComplete="url"
              spellCheck={false}
              value={value}
              disabled={loading}
              error={inputError ?? undefined}
              onChange={(event) => {
                setValue(event.target.value);
                setInputError(null);
                if (mediaStatus !== "idle") {
                  reset();
                }
              }}
              action={
                <Button
                  type="submit"
                  className="fetch__submit"
                  loading={loading}
                >
                  {loading ? "Checking…" : "Fetch"}
                </Button>
              }
            />

            {loading && (
              <div className="fetch__status" aria-live="polite">
                <Progress />
                <p className="fetch__status-text">
                  Checking {value.trim()}…
                </p>
              </div>
            )}
          </form>

          {mediaStatus === "ready" && metadata !== null && (
            <MediaPreview key={metadata.sourceUrl} metadata={metadata} />
          )}

          {mediaStatus === "error" && (
            <Panel className="preview-error" aria-live="polite">
              <p className="preview-error__title">Couldn&apos;t load that link</p>
              <p className="preview-error__text">{message}</p>
              <p className="preview-error__hint">
                Double-check the link, then try again.
              </p>
            </Panel>
          )}

          {mediaStatus === "idle" && (
            <Panel className="empty" aria-label="No downloads yet">
              <p className="empty__title">No media loaded yet</p>
              <p className="empty__text">
                Paste a link above to see its title, duration and available
                formats.
              </p>
            </Panel>
          )}

          <footer className="home__footer">
            <span className="home__footer-item">
              <span
                className={`home__status-dot home__status-dot--${status}`}
                aria-hidden="true"
              />
              {backendLabel}
            </span>
            <span className="home__footer-divider" aria-hidden="true" />
            <span className="home__footer-item">
              {info ? `v${info.version}` : `v${appEnv.version ?? "0.1.0"}`}
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}