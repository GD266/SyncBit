import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import "./Input.css";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  label?: string;
  hint?: string;
  error?: string;
  action?: ReactNode;
  className?: string;
  controlClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    hint,
    error,
    action,
    className,
    controlClassName,
    id,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = error ? `${inputId}-error` : undefined;

  return (
    <div className={className}>
      {(label || hint) && (
        <div className="field__top">
          {label && (
            <label htmlFor={inputId} className="field__label">
              {label}
            </label>
          )}
          {hint && <span className="field__hint">{hint}</span>}
        </div>
      )}
      <div
        className={[
          "field__control",
          error ? "field__control--invalid" : "",
          controlClassName ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <input
          ref={ref}
          id={inputId}
          className="field__input"
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          {...rest}
        />
        {action}
      </div>
      {error && (
        <p id={errorId} className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});