import { AlertTriangle } from "lucide-react";
import { formatRupees } from "@/lib/formatters";
import type { AccountsRow } from "./types";

/**
 * Outstanding-balance alert — the user's "notification in Accounts Hub" for
 * partial payments. Renders a banner above the board when one or more collabs
 * have been part-paid but still carry a balance (full payment not done). Lists
 * how many collabs + the total outstanding amount, with the worst few called
 * out by creator + remainder. Silent when nothing is outstanding.
 */
export function OutstandingAlert({ rows }: { rows: AccountsRow[] }) {
  const partials = rows
    .filter((r) => r._isPartial && Number(r._remainder ?? 0) > 0)
    .sort((a, b) => Number(b._remainder ?? 0) - Number(a._remainder ?? 0));

  if (partials.length === 0) return null;

  const totalOutstanding = partials.reduce(
    (sum, r) => sum + Number(r._remainder ?? 0),
    0,
  );
  const preview = partials.slice(0, 4);
  const extra = partials.length - preview.length;

  return (
    <div className="acc-outstanding-alert" role="status" aria-live="polite">
      <div className="acc-outstanding-alert__head">
        <AlertTriangle size={15} aria-hidden />
        <span className="acc-outstanding-alert__title">
          {partials.length} collab{partials.length === 1 ? "" : "s"} partially
          paid — {formatRupees(totalOutstanding)} still outstanding
        </span>
      </div>
      <ul className="acc-outstanding-alert__list">
        {preview.map((r) => {
          const hasName = !!(r.creator?.inf_name ?? r.creator?.username);
          const collabId =
            r.collab_id ??
            (r.inf_id ? `${r.inf_id}-C${Number(r.collab_number ?? 1)}` : null);
          return (
          <li key={r.post_id}>
            <span className="acc-outstanding-alert__who">
              {r.creator?.inf_name ?? r.creator?.username ?? r.post_id_short ?? r.post_id}
              {!hasName && collabId && (
                <span
                  className="text-[0.7rem] text-text-tertiary"
                  title="Collab ID — groups all deliverables of this collaboration"
                >
                  {" · "}
                  {collabId}
                </span>
              )}
            </span>
            <span className="acc-outstanding-alert__bal tabular">
              {formatRupees(Number(r._remainder ?? 0))} due
              <span className="acc-outstanding-alert__of">
                {" "}
                ({formatRupees(Number(r._paidSoFar ?? 0))} of{" "}
                {formatRupees(Number(r.commercial_amount ?? 0))} paid)
              </span>
            </span>
          </li>
          );
        })}
        {extra > 0 && (
          <li className="acc-outstanding-alert__more">
            +{extra} more partially-paid collab{extra === 1 ? "" : "s"}
          </li>
        )}
      </ul>
    </div>
  );
}
