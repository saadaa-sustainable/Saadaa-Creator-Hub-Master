import { type InputHTMLAttributes, type Ref, useId } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helper?: string;
  error?: string;
  ref?: Ref<HTMLInputElement>;
}

export function Input({
  className,
  label,
  helper,
  error,
  id,
  ref,
  ...rest
}: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const describedBy = [
    helper ? `${inputId}-helper` : null,
    error ? `${inputId}-error` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label
          htmlFor={inputId}
          className="text-[0.78rem] font-semibold text-text-secondary"
        >
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? "true" : undefined}
        className={cn(
          "w-full rounded-sm border border-border bg-bg-white px-3 py-2 text-sm placeholder:text-text-tertiary",
          "focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30",
          "disabled:bg-bg-muted disabled:cursor-not-allowed",
          error && "border-danger-mid focus:border-danger focus:ring-danger/20",
          className,
        )}
        {...rest}
      />
      {helper && !error && (
        <p
          id={`${inputId}-helper`}
          className="text-[0.72rem] text-text-tertiary"
        >
          {helper}
        </p>
      )}
      {error && (
        <p
          id={`${inputId}-error`}
          className="text-[0.72rem] text-danger"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  );
}
