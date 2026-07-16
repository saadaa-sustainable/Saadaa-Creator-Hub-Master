"use client";

import { useEffect, useState } from "react";

/**
 * Instant client-side search plumbing for the stage pages.
 *
 * The filter bars used to push every keystroke into the `q` URL param via
 * router.replace, which re-ran the whole server page (queue + KPIs + filter
 * options) per search — seconds of latency and stale-looking results the team
 * "fixed" by refreshing. Search is now applied in the table components over
 * the already-loaded rows: the filter bar broadcasts keystrokes on a window
 * event (instant), and only mirrors the value into the URL with
 * history.replaceState (shareable links, no server round trip).
 */

const eventName = (scope: string) => `ch:live-search:${scope}`;

export function dispatchLiveSearch(scope: string, value: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(eventName(scope), { detail: value }));
}

/** Mirror `q` into the URL without triggering a Next.js navigation. */
export function syncSearchParam(value: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const v = value.trim();
  if (v) url.searchParams.set("q", v);
  else url.searchParams.delete("q");
  window.history.replaceState(window.history.state, "", url.toString());
}

/** Live search value for `scope` — seeded from the URL's `q` on first render. */
export function useLiveSearch(scope: string, initial = ""): string {
  const [q, setQ] = useState(initial);
  useEffect(() => {
    const handler = (e: Event) =>
      setQ(String((e as CustomEvent).detail ?? ""));
    window.addEventListener(eventName(scope), handler);
    return () => window.removeEventListener(eventName(scope), handler);
  }, [scope]);
  return q;
}
