"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Lightbulb, X } from "lucide-react";
import { KM_REGISTRY } from "./content/registry";

/**
 * Global Know More modal. Mounted once in the (app) layout shell.
 *
 * Listens for any click on a `[data-know-more]` element (every PageHeader's
 * "Know More" button carries the attribute) and opens the registered content
 * component for that slug. Unknown slugs fall through to a soft "coming soon"
 * panel instead of throwing — easier to debug than a blank crash.
 */
export function KnowMoreModal() {
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Single document-level delegation — works for any future PageHeader
  // instance without re-mounting listeners.
  useEffect(() => {
    if (!mounted) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest("[data-know-more]") as HTMLElement | null;
      if (!btn) return;
      const slug = btn.getAttribute("data-know-more");
      if (!slug) return;
      e.preventDefault();
      setOpenSlug(slug);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [mounted]);

  // Esc to close + scroll lock while open.
  useEffect(() => {
    if (!openSlug) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenSlug(null);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [openSlug]);

  const close = useCallback(() => setOpenSlug(null), []);

  if (!mounted || !openSlug) return null;

  const Content = KM_REGISTRY[openSlug];

  return createPortal(
    <div className="km-backdrop" onClick={close}>
      <aside
        className="km-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Know More"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="km-panel__head">
          <div className="km-panel__title">
            <Lightbulb size={15} aria-hidden />
            <span>Know More</span>
            <span className="km-panel__slug">{openSlug}</span>
          </div>
          <button
            type="button"
            className="km-panel__close"
            onClick={close}
            aria-label="Close"
          >
            <X size={16} aria-hidden />
          </button>
        </header>
        <div className="km-panel__body">
          {Content ? (
            <Content />
          ) : (
            <div className="km-empty">
              <p>
                Help content for <code>{openSlug}</code> hasn&apos;t been
                written yet. Ping the platform team to fill it in.
              </p>
            </div>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}
