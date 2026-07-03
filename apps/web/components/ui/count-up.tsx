"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animated number — counts from 0 to `value` the first time it scrolls into
 * view (ease-out-quart, ~0.9s). Static render when the user prefers reduced
 * motion or when the value changes after mount (re-renders snap, they don't
 * re-count — a dashboard that re-counts on every filter change is noise).
 *
 * Pass `format` for anything beyond plain integers (₹, %, compact notation);
 * it receives the eased in-flight value, so round inside the formatter.
 */
export function CountUp({
  value,
  format,
  durationMs = 900,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  durationMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(0);
  const played = useRef(false);

  useEffect(() => {
    if (played.current) {
      setDisplay(value);
      return;
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      played.current = true;
      setDisplay(value);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      played.current = true;
      setDisplay(value);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting) || played.current) return;
        played.current = true;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / durationMs);
          const eased = 1 - Math.pow(1 - t, 4); // ease-out-quart
          setDisplay(value * eased);
          if (t < 1) raf = requestAnimationFrame(tick);
          else setDisplay(value);
        };
        raf = requestAnimationFrame(tick);
      },
      // Generous rootMargin: tiles start counting ~600px BEFORE they enter the
      // viewport, so scrolling never catches numbers mid-spin — that read as
      // "the page keeps reloading" on long dashboards.
      { threshold: 0.01, rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, durationMs]);

  const text = format
    ? format(display)
    : Math.round(display).toLocaleString("en-IN");

  return (
    <span ref={ref} className={className}>
      {text}
    </span>
  );
}
