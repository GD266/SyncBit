import { appEnv } from "../../config/env";
import { useAppInfo } from "../../hooks/useAppInfo";
import { capitalize, formatTitle } from "../../lib/utils";

export function HomeScreen() {
  const { status, info, message } = useAppInfo();

  return (
    <main className="home">
      <section className="card" aria-label="SyncBit status">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <svg viewBox="0 0 32 32" role="img">
              <rect width="32" height="32" rx="7" />
              <path
                d="M9 16h13m0 0-4-4m4 4-4 4"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </span>
          <div>
            <h1>SyncBit is running</h1>
            <p className="subtitle">
              {appEnv.environment === "development"
                ? "Development build"
                : "Production build"}
            </p>
          </div>
        </div>

        {status === "loading" && <p className="status">Connecting to backend…</p>}

        {status === "error" && (
          <div className="status error" role="alert">
            <strong>Backend unreachable</strong>
            <span>{message}</span>
          </div>
        )}

        {status === "ready" && info && (
          <dl className="details">
            <div>
              <dt>Build</dt>
              <dd>{formatTitle(info.name, info.version)}</dd>
            </div>
            <div>
              <dt>Environment</dt>
              <dd>{capitalize(info.environment)}</dd>
            </div>
            <div>
              <dt>Platform</dt>
              <dd>
                {capitalize(info.platform)} ({info.arch})
              </dd>
            </div>
            <div>
              <dt>Log level</dt>
              <dd>{info.logLevel}</dd>
            </div>
            <div>
              <dt>Data directory</dt>
              <dd className="path">{info.dataDir}</dd>
            </div>
          </dl>
        )}
      </section>
    </main>
  );
}