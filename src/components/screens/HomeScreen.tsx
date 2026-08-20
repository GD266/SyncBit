import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { appEnv } from "../../config/env";
import { useAppInfo } from "../../hooks/useAppInfo";
import { AppHeader } from "../layout/AppHeader";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Panel } from "../ui/Panel";
import { Progress } from "../ui/Progress";
import "./HomeScreen.css";

type Phase = "idle" | "loading";

const SIMULATED_FETCH_MS = 1800;

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

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
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);
  const { status, info } = useAppInfo();

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent) => {
      event.preventDefault();
      if (phase === "loading") {
        return;
      }
      const trimmed = value.trim();
      if (!trimmed) {
        inputRef.current?.focus();
        return;
      }
      if (!isValidUrl(trimmed)) {
        setError("Enter a valid URL, including https://");
        inputRef.current?.focus();
        return;
      }
      setError(null);
      setPhase("loading");
      timerRef.current = window.setTimeout(() => {
        setPhase("idle");
      }, SIMULATED_FETCH_MS);
    },
    [phase, value],
  );

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
            setError(null);
          }
        }).catch(() => {});
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
            <p className="hero__eyebrow">SyncBit</p>
            <h1 id="hero-title" className="hero__title">
              Turn any link into a file.
            </h1>
            <p className="hero__subtitle">
              Paste a URL and SyncBit fetches the content — files, media, pages —
              and keeps it in sync locally.
            </p>
          </section>

          <form className="fetch" onSubmit={handleSubmit} noValidate>
            <Input
              ref={inputRef}
              className="fetch__field"
              controlClassName="fetch__bar"
              label="Link"
              hint={`Press ${modKey()}K to focus`}
              placeholder="https://example.com/file.zip"
              type="url"
              autoComplete="url"
              spellCheck={false}
              value={value}
              disabled={phase === "loading"}
              error={error ?? undefined}
              onChange={(event) => {
                setValue(event.target.value);
                if (error) {
                  setError(null);
                }
              }}
              action={
                <Button
                  type="submit"
                  className="fetch__submit"
                  loading={phase === "loading"}
                >
                  {phase === "loading" ? "Fetching…" : "Fetch"}
                </Button>
              }
            />

            {phase === "loading" && (
              <div className="fetch__status" aria-live="polite">
                <Progress />
                <p className="fetch__status-text">
                  Fetching {value.trim()}…
                </p>
              </div>
            )}
          </form>

          <Panel className="empty" aria-label="No downloads yet">
            <p className="empty__title">No downloads yet</p>
            <p className="empty__text">
              Fetched files will appear here with their sync status. Paste a
              link above to get started.
            </p>
          </Panel>

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