"use client";

import { useState } from "react";
import { FileText, PiggyBank, PlusCircle } from "lucide-react";
import type { CampaignListRow } from "./queries";
import { CampaignCreateForm } from "./create-form";
import { ExistingCampaigns } from "./existing-campaigns";
import { BulkAssignCampaignPanel } from "./bulk-assign-panel";
import { BudgetTopUpForm } from "./topup-form";
import type {
  AssignableCampaign,
  UnassignedReachOut,
} from "./bulk-assign-queries";

interface CampaignCreateSwitcherProps {
  campaigns: CampaignListRow[];
  /** Campaign Owner + Global Admin: may edit / close / reopen. */
  canManage?: boolean;
  /** Reach-outs with no campaign yet (for the bulk-assign tool). */
  unassigned?: UnassignedReachOut[];
  /** Live campaigns a reach-out can be attached to. */
  assignableCampaigns?: AssignableCampaign[];
}

export function CampaignCreateSwitcher({
  campaigns,
  canManage = false,
  unassigned = [],
  assignableCampaigns = [],
}: CampaignCreateSwitcherProps) {
  const [mode, setMode] = useState<"create" | "topup" | "existing">("create");

  return (
    <div className="campaign-create-switcher">
      <div
        className="campaign-segmented-control"
        role="tablist"
        aria-label="Campaign view"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "create"}
          className={mode === "create" ? "is-active" : ""}
          onClick={() => setMode("create")}
        >
          <PlusCircle size={14} />
          <span className="seg-label">
            <span className="hidden min-[620px]:inline">Create Campaign</span>
            <span className="min-[620px]:hidden">Create</span>
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "topup"}
          className={mode === "topup" ? "is-active" : ""}
          onClick={() => setMode("topup")}
        >
          <PiggyBank size={14} />
          <span className="seg-label">
            <span className="hidden min-[620px]:inline">
              Add Budget (Existing)
            </span>
            <span className="min-[620px]:hidden">Add Budget</span>
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "existing"}
          className={mode === "existing" ? "is-active" : ""}
          onClick={() => setMode("existing")}
        >
          <FileText size={14} />
          <span className="seg-label">
            <span className="hidden min-[620px]:inline">
              Existing Campaigns
            </span>
            <span className="min-[620px]:hidden">Existing</span>
          </span>
          <span className="seg-count">{campaigns.length}</span>
        </button>
      </div>

      {mode === "create" ? (
        <CampaignCreateForm />
      ) : mode === "topup" ? (
        <BudgetTopUpForm campaigns={campaigns} />
      ) : (
        <div className="space-y-4">
          <ExistingCampaigns campaigns={campaigns} canManage={canManage} />
          {canManage && (
            <BulkAssignCampaignPanel
              rows={unassigned}
              campaigns={assignableCampaigns}
            />
          )}
        </div>
      )}
    </div>
  );
}
