import type { HTMLAttributes, ReactNode } from "react";
import "./Panel.css";

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export function Panel({ className, children, ...rest }: PanelProps) {
  return (
    <div className={["panel", className ?? ""].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  );
}