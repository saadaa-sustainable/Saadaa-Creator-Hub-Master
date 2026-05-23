import { formatInTimeZone } from "date-fns-tz";

const IST = "Asia/Kolkata";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrWithPaise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
});

const intl = new Intl.NumberFormat("en-IN");

export function formatRupees(
  value: number | null | undefined,
  opts?: { paise?: boolean },
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return opts?.paise ? inrWithPaise.format(value) : inr.format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return intl.format(value);
}

export function formatFollowers(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

export function formatDate(
  value: string | Date | null | undefined,
  pattern = "dd MMM yyyy",
): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return formatInTimeZone(date, IST, pattern);
}

export function formatDateTime(
  value: string | Date | null | undefined,
): string {
  return formatDate(value, "dd MMM yyyy, HH:mm");
}

export function pct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

/**
 * Influencer category derivation from followers — matches creators.category GENERATED column.
 */
export type CreatorTier = "Nano" | "Micro" | "Mid tier" | "Macro" | "Mega";

export function tierFromFollowers(
  followers: number | null | undefined,
): CreatorTier | null {
  if (followers === null || followers === undefined) return null;
  if (followers < 10_000) return "Nano";
  if (followers < 50_000) return "Micro";
  if (followers < 300_000) return "Mid tier";
  if (followers < 1_000_000) return "Macro";
  return "Mega";
}

/**
 * Weserv proxy for Instagram CDN images — bypasses Referer blocks.
 */
export function proxyAvatarUrl(
  url: string | null | undefined,
  size = 96,
): string | null {
  if (!url) return null;
  const encoded = encodeURIComponent(url);
  return `https://images.weserv.nl/?url=${encoded}&w=${size}&h=${size}&fit=cover`;
}
