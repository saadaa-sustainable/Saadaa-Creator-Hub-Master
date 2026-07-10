"use client";
import { Download, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Accounts Hub export bar — Due + Paid CSV downloads. Mirrors legacy
 * export buttons that sit alongside the payment entry form at the top of
 * Index.html:6627-6710.
 *
 * Renders twice in the page tree so the visibility breakpoints can shift
 * the bar inline with the form on desktop vs below the KPI cards on
 * mobile. `variant` controls which copy is active.
 */
export function AccountsExportBar({
  variant = "desktop",
  hasPartial = false,
}: {
  variant?: "desktop" | "mobile";
  /** Show the "Partial Payment" export only when a partial payment exists. */
  hasPartial?: boolean;
}) {
  return (
    <div className={cn("acc-export-bar", `acc-export-bar--${variant}`)}>
      <span className="acc-export-bar__label">
        <FileSpreadsheet size={13} aria-hidden />
        Downloads
      </span>
      <a
        href="/api/accounts/export?mode=due"
        className="acc-export-bar__btn"
        download
        title="Download Due + Not Due rows as CSV"
      >
        <Download size={12} aria-hidden />
        Due CSV
      </a>
      <a
        href="/api/accounts/export?mode=paid"
        className="acc-export-bar__btn"
        download
        title="Download Paid rows as CSV"
      >
        <Download size={12} aria-hidden />
        Paid CSV
      </a>
      {hasPartial && (
        <a
          href="/api/accounts/export?mode=partial"
          className="acc-export-bar__btn"
          download
          title="Download collabs with an outstanding balance (partial payments) as CSV"
        >
          <Download size={12} aria-hidden />
          Partial Payment
        </a>
      )}
      <a
        href="/api/accounts/export?mode=all"
        className="acc-export-bar__btn acc-export-bar__btn--primary"
        download
        title="Download full corpus as CSV"
      >
        <Download size={12} aria-hidden />
        All
      </a>
    </div>
  );
}
