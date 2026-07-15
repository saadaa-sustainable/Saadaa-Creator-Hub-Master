"use client";

import { Info } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * V0 / V1 / V2 chip + the shared plain-language explainer. The versions idea
 * is new to the team, so EVERY surface that shows a V-number renders it
 * through this chip (hover explains itself) and pages carry the explainer box.
 */

export type VersionKindLite = "initial" | "carry_forward" | "top_up";

export function versionTitle(n: number, kind: VersionKindLite): string {
  if (n === 0 || kind === "initial")
    return `V${n} — the first created budget of this campaign (this is the "Actual")`;
  if (kind === "carry_forward")
    return `V${n} — money left unused last month, carried into this month automatically (not new money)`;
  return `V${n} — new money added to this campaign (top-up), approved by a Global Admin`;
}

export function VersionChip({
  n,
  kind,
  className,
}: {
  n: number;
  kind: VersionKindLite;
  className?: string;
}) {
  return (
    <span
      className={cn("budget-vchip tabular", className)}
      title={versionTitle(n, kind)}
      tabIndex={0}
      aria-label={versionTitle(n, kind)}
    >
      V{n}
    </span>
  );
}

/** Plain-language legend, rendered near every version table. */
export function VersionExplainer({ compact }: { compact?: boolean }) {
  return (
    <div className={cn("budget-vexplainer", compact && "budget-vexplainer--compact")}>
      <Info size={13} aria-hidden />
      <div>
        <strong>What are V0, V1, V2…?</strong> Every campaign&apos;s money is
        tracked in numbered parts. <strong>V0</strong> is the first created
        budget. Money a month doesn&apos;t use rolls into the next month
        automatically as the next number (a <em>carry-forward</em> — same
        money, new month). When the team adds fresh money to a running
        campaign, that top-up also takes the next number and needs Global
        Admin approval. Hover any V-chip to see which one it is.
      </div>
    </div>
  );
}
