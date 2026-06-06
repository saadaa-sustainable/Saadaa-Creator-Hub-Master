import type { ButtonHTMLAttributes, Ref } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const button = cva(
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-sm font-semibold transition-[background,color,border-color,box-shadow,transform] duration-150 ease-out active:translate-y-px disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg-base",
  {
    variants: {
      variant: {
        // Yellow CTA — primary action only, <10% of any screen
        primary:
          "border border-accent bg-accent text-accent-text hover:bg-accent-amber active:bg-accent-sand",
        secondary:
          "border border-border bg-bg-white text-text-primary hover:border-border-strong hover:bg-bg-alt",
        ghost: "bg-transparent text-text-primary hover:bg-bg-alt",
        danger:
          "bg-danger-bg text-danger border border-danger-mid hover:bg-danger/10",
        link: "bg-transparent text-text-link hover:underline px-0",
      },
      size: {
        sm: "min-h-9 px-3 py-1.5 text-sm",
        md: "min-h-10 px-4 py-2 text-sm",
        lg: "min-h-11 px-5 py-2.5 text-base",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  loading?: boolean;
  /** Render as the immediate child (Radix Slot). Use for `<Link>` wrappers. */
  asChild?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  className,
  variant,
  size,
  loading,
  asChild,
  disabled,
  children,
  ref,
  ...rest
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  if (asChild) {
    return (
      <Comp
        className={cn(button({ variant, size }), className)}
        ref={ref as never}
        {...(rest as object)}
      >
        {children}
      </Comp>
    );
  }

  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      className={cn(button({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && (
        <span
          className="skeleton-shimmer inline-block h-2.5 w-8 rounded-sm bg-current/20"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}
