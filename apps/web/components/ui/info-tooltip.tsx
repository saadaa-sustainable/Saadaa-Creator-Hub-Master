"use client";

import * as Popover from "@radix-ui/react-popover";
import { Info, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

interface InfoTooltipProps {
  content: ReactNode;
  title?: string;
  label?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  className?: string;
  contentClassName?: string;
}

/**
 * Collision-aware definition popover for KPIs, charts, tables, and form help.
 * It opens on hover/focus for desktop and click/tap for touch devices.
 */
export function InfoTooltip({
  content,
  title,
  label = title ? `About ${title}` : "View definition",
  side = "top",
  align = "center",
  className,
  contentClassName,
}: InfoTooltipProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepOpen = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setOpen(true);
  };
  const closeAfterHover = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={cn("info-tooltip-trigger", className)}
          aria-label={label}
          aria-expanded={open}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") keepOpen();
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") closeAfterHover();
          }}
          onFocus={() => setOpen(true)}
        >
          <Info size={13} aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side={side}
          align={align}
          sideOffset={7}
          collisionPadding={12}
          avoidCollisions
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") keepOpen();
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") closeAfterHover();
          }}
          className={cn("info-tooltip-content", contentClassName)}
        >
          <div className="info-tooltip-content__head">
            <strong id={titleId}>{title ?? "What this means"}</strong>
            <Popover.Close
              className="info-tooltip-content__close"
              aria-label="Close definition"
            >
              <X size={12} aria-hidden />
            </Popover.Close>
          </div>
          <div className="info-tooltip-content__body" aria-labelledby={titleId}>
            {content}
          </div>
          <Popover.Arrow
            className="info-tooltip-content__arrow"
            width={12}
            height={6}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
