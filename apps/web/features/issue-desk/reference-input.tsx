"use client";

import { useEffect, useRef, useState } from "react";
import { Link2, Loader2, Megaphone, Package, UserRound } from "lucide-react";
import { searchTicketReferences } from "./actions";
import type { TicketReference } from "./types";

const TYPE_ICON = {
  campaign: Megaphone,
  creator: UserRound,
  collab: Package,
} as const;

/**
 * Free-text input that links a ticket to a CreatorHub entity (campaign / creator
 * / collab). Debounced autocomplete; selecting a suggestion fills the field with
 * its label, but the operator can also type anything (a URL, a free note).
 */
export function TicketReferenceInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [results, setResults] = useState<TicketReference[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchTicketReferences(q);
        if (!cancelled) {
          setResults(r);
          setOpen(r.length > 0);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Link2
          size={13}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary"
          aria-hidden
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Link a campaign, creator or collab (optional)"
          className="h-9 w-full rounded-[10px] border border-border bg-bg-white pl-7 pr-7 text-[0.8rem] text-text-primary placeholder:text-text-tertiary focus:border-[#C9A882] focus:outline-none focus:ring-2 focus:ring-[#F0C61E]/25"
        />
        {loading && (
          <Loader2
            size={13}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-text-tertiary"
            aria-hidden
          />
        )}
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-[10px] border border-border bg-bg-white py-1 shadow-lg">
          {results.map((r) => {
            const Icon = TYPE_ICON[r.type];
            return (
              <li key={`${r.type}-${r.id}`}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(r.label);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[0.78rem] text-text-primary hover:bg-bg-alt"
                >
                  <Icon size={13} className="shrink-0 text-text-tertiary" aria-hidden />
                  <span className="truncate">{r.label}</span>
                  <span className="ml-auto shrink-0 text-[0.66rem] uppercase tracking-wide text-text-tertiary">
                    {r.type}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
