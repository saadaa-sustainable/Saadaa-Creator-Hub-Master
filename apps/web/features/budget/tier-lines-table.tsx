"use client";

import { formatRupees } from "@/lib/formatters";
import type { TierLine } from "./types";

/**
 * The budget-split table — one row per campaign_budget tier line (or per
 * parked draft line on a pending top-up). SHARED between the Budget tab's
 * version expander and the Approvals budget card so Global Admins see the
 * exact same split everywhere a version is decided.
 */
export function TierLinesTable({ lines }: { lines: TierLine[] }) {
  const totals = lines.reduce(
    (acc, l) => {
      acc.creators += Number(l.num_influencers ?? 0);
      acc.comp += Number(l.total_cost ?? 0);
      acc.total += Number(l.total_with_garments ?? 0);
      return acc;
    },
    { creators: 0, comp: 0, total: 0 },
  );
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-bg-white">
      <table className="w-full min-w-[640px] border-collapse text-[0.74rem]">
        <thead>
          <tr className="bg-bg-surface text-left text-[0.58rem] uppercase tracking-[0.08em] text-text-secondary">
            <th className="px-3 py-1.5">Tier</th>
            <th className="px-3 py-1.5">Collab</th>
            <th className="px-3 py-1.5 text-right">No.</th>
            <th className="px-3 py-1.5 text-right">Avg Comp ₹</th>
            <th className="px-3 py-1.5 text-right">Comp Total</th>
            <th className="px-3 py-1.5 text-right">Min G</th>
            <th className="px-3 py-1.5 text-right">Max G</th>
            <th className="px-3 py-1.5 text-right">Garment Cost</th>
            <th className="px-3 py-1.5 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id ?? i} className="border-t border-[#F0EAD6]">
              <td className="px-3 py-1.5">{l.tier ?? "—"}</td>
              <td className="px-3 py-1.5">{l.collab_type ?? "—"}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {l.num_influencers ?? 0}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {formatRupees(Number(l.avg_comp ?? 0))}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {formatRupees(Number(l.total_cost ?? 0))}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {l.min_garments ?? "—"}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {l.max_garments ?? "—"}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {formatRupees(Number(l.est_garment_cost ?? 0))}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums font-bold">
                {formatRupees(Number(l.total_with_garments ?? 0))}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[#E7E2D2] bg-bg-surface font-bold text-text-primary">
            <td className="px-3 py-1.5" colSpan={2}>
              TOTAL
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">
              {totals.creators}
            </td>
            <td className="px-3 py-1.5" />
            <td className="px-3 py-1.5 text-right tabular-nums">
              {formatRupees(totals.comp)}
            </td>
            <td className="px-3 py-1.5" colSpan={3} />
            <td className="px-3 py-1.5 text-right tabular-nums">
              {formatRupees(totals.total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
