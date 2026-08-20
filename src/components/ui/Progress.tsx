import "./Progress.css";

export function Progress() {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label="Fetching link"
      aria-valuetext="Fetching link"
    >
      <div className="progress__bar" />
    </div>
  );
}