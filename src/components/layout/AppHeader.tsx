import { appEnv } from "../../config/env";
import { BrandMark } from "../brand/BrandMark";
import "./AppHeader.css";

export function AppHeader() {
  return (
    <header className="app-header">
      <div className="app-header__inner">
        <div className="app-header__brand">
          <BrandMark size={18} />
          <span className="app-header__name">GrabAClip</span>
        </div>
        <span className="app-header__env">
          <span className="app-header__dot" aria-hidden="true" />
          {appEnv.environment === "development" ? "Development" : "Production"}
        </span>
      </div>
    </header>
  );
}