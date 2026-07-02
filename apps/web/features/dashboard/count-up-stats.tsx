"use client";

import { CountUp } from "@/components/ui/count-up";
import { formatRupees } from "@/lib/formatters";

/**
 * Server-safe CountUp variants. `CountUp` takes a `format` function, which a
 * server component can't pass across the RSC boundary — so the dashboard's
 * server-rendered tiles use these named client wrappers instead. Each bakes in
 * one formatter whose FINAL frame matches the previous static output
 * byte-for-byte (values are integers everywhere these are used).
 */

const fmtInt = (x: number) => String(Math.round(x));
const fmtRupees = (x: number) => formatRupees(Math.round(x));
// Spotlight renders its own ₹ icon, so the glyph is stripped from the text.
const fmtRupeesBare = (x: number) => formatRupees(Math.round(x)).replace(/^₹/, "");

/** Plain integer — matches `{n}` / `String(n)` JSX output (no grouping). */
export function CountUpInt({ value, className }: { value: number; className?: string }) {
  return <CountUp value={value} format={fmtInt} className={className} />;
}

/** ₹ currency via the shared formatter — matches `formatRupees(n)`. */
export function CountUpRupees({ value, className }: { value: number; className?: string }) {
  return <CountUp value={value} format={fmtRupees} className={className} />;
}

/** ₹ currency without the leading ₹ glyph (icon rendered separately). */
export function CountUpRupeesBare({ value, className }: { value: number; className?: string }) {
  return <CountUp value={value} format={fmtRupeesBare} className={className} />;
}
