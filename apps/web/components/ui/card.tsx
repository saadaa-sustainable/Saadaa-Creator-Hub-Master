import type { HTMLAttributes, Ref } from "react";
import { cn } from "@/lib/cn";

/**
 * Solid card primitive — modals, login, settings. NOT the glass surface.
 * Compound: Card / CardHeader / CardTitle / CardDescription / CardContent / CardFooter.
 * Glass surface (the one used for app sections) lives in `glass-card.tsx`.
 */

interface BaseProps extends HTMLAttributes<HTMLDivElement> {
  ref?: Ref<HTMLDivElement>;
}

export function Card({ className, ref, ...props }: BaseProps) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-md border border-border bg-bg-white text-text-primary shadow-sm transition-[border-color,box-shadow] duration-150 ease-out focus-within:border-border-strong focus-within:shadow-[0_12px_28px_-24px_rgba(22,21,19,0.34)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ref, ...props }: BaseProps) {
  return (
    <div
      ref={ref}
      className={cn("flex flex-col gap-1.5 p-5 pb-3 sm:p-6 sm:pb-3", className)}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ref,
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { ref?: Ref<HTMLHeadingElement> }) {
  return (
    <h3
      ref={ref}
      className={cn(
        "font-display text-lg font-semibold leading-tight tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ref,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & { ref?: Ref<HTMLParagraphElement> }) {
  return (
    <p
      ref={ref}
      className={cn("text-sm text-text-secondary", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ref, ...props }: BaseProps) {
  return (
    <div
      ref={ref}
      className={cn("p-5 pt-0 sm:p-6 sm:pt-0", className)}
      {...props}
    />
  );
}

export function CardFooter({ className, ref, ...props }: BaseProps) {
  return (
    <div
      ref={ref}
      className={cn(
        "flex items-center gap-2 p-5 pt-0 sm:p-6 sm:pt-0",
        className,
      )}
      {...props}
    />
  );
}
