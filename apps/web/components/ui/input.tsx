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
    <div className="flex min-w-0 flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-[0.76rem] font-bold leading-none text-text-secondary"
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
          "min-h-10 w-full rounded-sm border border-border bg-bg-white px-3 py-2 text-base text-text-primary placeholder:text-text-tertiary sm:text-sm",
          "transition-[background,border-color,box-shadow] duration-150 ease-out hover:border-border-strong",
          "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30",
          "disabled:cursor-not-allowed disabled:bg-bg-muted disabled:text-text-tertiary",
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
