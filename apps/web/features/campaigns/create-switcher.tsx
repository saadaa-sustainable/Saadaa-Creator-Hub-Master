"use client";

import { useState } from "react";
import { FileText, PlusCircle } from "lucide-react";
import type { CampaignListRow } from "./queries";
import { CampaignCreateForm } from "./create-form";
import { ExistingCampaigns } from "./existing-campaigns";

interface CampaignCreateSwitcherProps {
  campaigns: CampaignListRow[];
}

export function CampaignCreateSwitcher({
  campaigns,
}: CampaignCreateSwitcherProps) {
  const [mode, setMode] = useState<"create" | "existing">("create");

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
          Create Campaign
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "existing"}
          className={mode === "existing" ? "is-active" : ""}
          onClick={() => setMode("existing")}
        >
          <FileText size={14} />
          Existing Campaigns
          <span>{campaigns.length}</span>
        </button>
      </div>

      {mode === "create" ? (
        <CampaignCreateForm />
      ) : (
        <ExistingCampaigns campaigns={campaigns} />
      )}
    </div>
  );
}
