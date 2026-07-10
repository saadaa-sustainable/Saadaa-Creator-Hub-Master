"use server";

import { assertPermission } from "@/lib/rbac.server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  ONBOARDING_EDIT_FIELD_LABELS,
  type OnboardingEditField,
} from "@/features/onboarding/edit-fields";

/**
 * Detail behind an Approval History row. For onboarding edits this is the
 * stored before/after diff; for campaign edits it's the proposed payload the
 * admin decided on. Opened by clicking the history row.
 */
export interface ApprovalHistoryDetail {
  kind: "onboarding_edit" | "campaign_edit";
  entityId: string;
  status: string | null;
  requestedBy: string | null;
  decidedBy: string | null;
  reason: string | null;
  changes: Array<{ label: string; before: string | null; after: string }>;
}

const CAMPAIGN_PAYLOAD_LABELS: Record<string, string> = {
  campaignName: "Campaign Name",
  keyMessage: "Key Message",
  totalBudget: "Total Budget (₹)",
  numCreators: "No. of Creators",
  startDate: "Start Date",
  endDate: "End Date",
  briefLink: "Brief Link",
  internalBriefLink: "Internal Brief Link",
  status: "Status",
};

export async function getApprovalHistoryDetail(input: {
  actionType: string;
  entityId: string;
}): Promise<
  { ok: true; detail: ApprovalHistoryDetail } | { ok: false; error: string }
> {
  await assertPermission("admin");
  const type = (input.actionType ?? "").trim().toLowerCase();
  const entityId = (input.entityId ?? "").trim();
  if (!entityId) return { ok: false, error: "No entity on this entry" };

  const supabase = createServiceClient() as any;

  if (type.includes("onboarding")) {
    const { data, error } = await supabase
      .from("onboarding_edit_requests")
      .select(
        "collab_id, status, requested_by_name, requested_by, decided_by_name, decided_by, reason, before, after",
      )
      .eq("collab_id", entityId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data)
      return { ok: false, error: "No stored edit found for this collab." };

    const before = (data.before ?? {}) as Record<string, unknown>;
    const after = (data.after ?? {}) as Record<string, unknown>;
    const fields = Object.keys(
      ONBOARDING_EDIT_FIELD_LABELS,
    ) as OnboardingEditField[];
    const changes = fields
      .map((f) => ({
        label: ONBOARDING_EDIT_FIELD_LABELS[f],
        before: String(before[f] ?? "").trim(),
        after: String(after[f] ?? "").trim(),
      }))
      .filter((c) => c.before !== c.after);
    return {
      ok: true,
      detail: {
        kind: "onboarding_edit",
        entityId,
        status: data.status ?? null,
        requestedBy: data.requested_by_name ?? data.requested_by ?? null,
        decidedBy: data.decided_by_name ?? data.decided_by ?? null,
        reason: data.reason ?? null,
        changes,
      },
    };
  }

  if (type.includes("campaign")) {
    const { data, error } = await supabase
      .from("campaign_approval_requests")
      .select(
        "campaign_id, status, request_payload, before_payload, requested_by_name, requested_by_email, decided_by_name, decided_by_email, notes",
      )
      .eq("campaign_id", entityId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data)
      return {
        ok: false,
        error: "No stored edit request found for this campaign.",
      };

    const payload = (data.request_payload ?? {}) as Record<string, unknown>;
    const beforePayload = (data.before_payload ?? {}) as Record<
      string,
      unknown
    >;
    const changes = Object.entries(payload)
      .filter(([, v]) => v != null && String(v).trim() !== "")
      .map(([k, v]) => ({
        label: CAMPAIGN_PAYLOAD_LABELS[k] ?? k,
        before:
          beforePayload[k] != null ? String(beforePayload[k]) : null,
        after: String(v),
      }))
      // Show only real differences when a before snapshot exists.
      .filter((c) => c.before == null || c.before !== c.after);
    return {
      ok: true,
      detail: {
        kind: "campaign_edit",
        entityId,
        status: data.status ?? null,
        requestedBy:
          data.requested_by_name ?? data.requested_by_email ?? null,
        decidedBy: data.decided_by_name ?? data.decided_by_email ?? null,
        reason: data.notes ?? null,
        changes,
      },
    };
  }

  return { ok: false, error: "No stored detail for this entry type." };
}
