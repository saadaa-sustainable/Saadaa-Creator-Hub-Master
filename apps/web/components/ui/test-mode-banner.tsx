import Link from "next/link";
import { FlaskConical, ArrowRight } from "lucide-react";

/**
 * Global Test Mode banner. Rendered above every view (in the app shell) whenever
 * one or more test scopes are active. Mirrors the DAM banner: states which scopes
 * are on, that new entries here are TEST entries hidden from real dashboards, and
 * — for non-admins — that they cannot create in these views until it's off.
 */
export function TestModeBanner({
  scopeLabels,
  isAdmin,
}: {
  scopeLabels: string[];
  isAdmin: boolean;
}) {
  if (scopeLabels.length === 0) return null;

  return (
    <div className="test-mode-banner" role="status" aria-live="polite">
      <FlaskConical size={16} className="test-mode-banner__icon" aria-hidden />
      <div className="test-mode-banner__body">
        <p className="test-mode-banner__title">
          TEST MODE ON — {scopeLabels.join(", ")}
        </p>
        <p className="test-mode-banner__sub">
          {isAdmin
            ? "Entries created in these views are TEST entries — hidden from all real dashboards & lists, and purged when the scope is turned off."
            : "Entries created in these views are TEST entries (hidden from real dashboards). You can't create here until an admin turns Test Mode off."}
        </p>
      </div>
      {isAdmin && (
        <Link href="/settings" className="test-mode-banner__cta">
          Manage in Settings
          <ArrowRight size={13} aria-hidden />
        </Link>
      )}
    </div>
  );
}
