import type { HTMLAttributes, Ref } from "react";
import { cn } from "@/lib/cn";

export interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Tighter inner padding for table-heavy sections */
  dense?: boolean;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Saadaa glass card — the ONE container pattern across the app.
 * Never nest. If a section needs to feel different, change density not wrapper.
 */
export function GlassCard({
  className,
  dense,
  children,
  ref,
  ...rest
}: GlassCardProps) {
  return (
    <div
      ref={ref}
      className={cn("glass-card", dense ? "p-4" : "p-6", className)}
      {...rest}
    >
      {children}
    </div>
  );
}
