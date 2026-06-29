import { createServiceClient } from "@/lib/supabase/server";

/**
 * Approvals queue — campaigns awaiting sign-off (status 'Pending Approval').
 * The Approvals page lets an admin approve (→ active) or reject them. Read-only;
 * the route already gates admin.
 */

export interface ApprovalItem {
  campaignId: string;
  campaignName: string | null;
  status: string | null;
  keyMessage: string | null;
  budget: number | null;
  creators: number | null;
  startDate: string | null;
  endDate: string | null;
  briefLink: string | null;
  createdBy: string | null;
  createdAt: string | null;
}

export interface ApprovalQueueData {
  items: ApprovalItem[];
  total: number;
}

type Raw = Record<string, unknown>;

export async function fetchApprovalQueue(): Promise<ApprovalQueueData> {
  const svc = createServiceClient() as any;
  const { data, error } = await svc
    .from("campaigns")
    .select(
      "campaign_id, campaign_name, status, key_message, total_budget, no_of_creators, start_date, end_date, brief_link, created_by, created_at",
    )
    .ilike("status", "pending%")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[approvals] queue query failed:", error.message);
    return { items: [], total: 0 };
  }

  const items: ApprovalItem[] = ((data ?? []) as Raw[]).map((r) => ({
    campaignId: String(r.campaign_id ?? ""),
    campaignName: (r.campaign_name as string | null) ?? null,
    status: (r.status as string | null) ?? null,
    keyMessage: (r.key_message as string | null) ?? null,
    budget: r.total_budget != null ? Number(r.total_budget) : null,
    creators: r.no_of_creators != null ? Number(r.no_of_creators) : null,
    startDate: (r.start_date as string | null) ?? null,
    endDate: (r.end_date as string | null) ?? null,
    briefLink: (r.brief_link as string | null) ?? null,
    createdBy: (r.created_by as string | null) ?? null,
    createdAt: (r.created_at as string | null) ?? null,
  }));

  return { items, total: items.length };
}
