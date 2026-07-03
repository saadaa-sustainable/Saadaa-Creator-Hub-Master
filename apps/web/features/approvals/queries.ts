import { createServiceClient } from "@/lib/supabase/server";

/**
 * Approvals queue — new campaigns and campaign edit requests awaiting sign-off.
 * Decisions are written to approval_logs, which also powers the history table
 * below and the global Audit Log.
 */

export type ApprovalKind = "campaign" | "edit";

export interface ApprovalItem {
  kind: ApprovalKind;
  approvalId?: number;
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
  notes?: string | null;
}

export type ApprovalHistoryStatus =
  | "approved"
  | "rejected"
  | "submitted"
  | "closed"
  | "reopened"
  | "other";

export interface ApprovalHistoryItem {
  id: string;
  actionType: string;
  action: string;
  entityId: string;
  actor: string;
  notes: string | null;
  at: string | null;
  status: ApprovalHistoryStatus;
}

export interface ApprovalQueueData {
  items: ApprovalItem[];
  total: number;
  history: ApprovalHistoryItem[];
  historyTotal: number;
}

type Raw = Record<string, unknown>;

const asString = (value: unknown): string | null => {
  const s = value == null ? "" : String(value).trim();
  return s || null;
};

const asNumber = (value: unknown): number | null => {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const historyStatus = (action: string): ApprovalHistoryStatus => {
  const lc = action.toLowerCase();
  if (lc.includes("approv")) return "approved";
  if (lc.includes("reject")) return "rejected";
  if (lc.includes("submit")) return "submitted";
  if (lc.includes("close")) return "closed";
  if (lc.includes("reopen")) return "reopened";
  return "other";
};

export async function fetchApprovalQueue(): Promise<ApprovalQueueData> {
  const svc = createServiceClient() as any;

  const [campaigns, edits, logs] = await Promise.all([
    svc
      .from("campaigns")
      .select(
        "campaign_id, campaign_name, status, key_message, total_budget, no_of_creators, start_date, end_date, brief_link, created_by, created_at",
      )
      .ilike("status", "pending%")
      .order("created_at", { ascending: false })
      .limit(200),
    svc
      .from("campaign_approval_requests")
      .select(
        "id, campaign_id, status, request_payload, requested_by_email, requested_by_name, notes, created_at",
      )
      .eq("request_type", "edit")
      .eq("status", "Pending Approval")
      .order("created_at", { ascending: false })
      .limit(200),
    svc
      .from("approval_logs")
      .select(
        "id, action_type, action, entity_id, admin_email, admin_name, notes, timestamp",
      )
      .order("timestamp", { ascending: false })
      .limit(100),
  ]);

  if (campaigns.error) {
    console.error(
      "[approvals] campaign queue query failed:",
      campaigns.error.message,
    );
  }
  if (edits.error) {
    console.error("[approvals] edit queue query failed:", edits.error.message);
  }
  if (logs.error) {
    console.error("[approvals] history query failed:", logs.error.message);
  }

  const campaignItems: ApprovalItem[] = ((campaigns.data ?? []) as Raw[]).map(
    (r) => ({
      kind: "campaign",
      campaignId: String(r.campaign_id ?? ""),
      campaignName: asString(r.campaign_name),
      status: asString(r.status),
      keyMessage: asString(r.key_message),
      budget: asNumber(r.total_budget),
      creators: asNumber(r.no_of_creators),
      startDate: asString(r.start_date),
      endDate: asString(r.end_date),
      briefLink: asString(r.brief_link),
      createdBy: asString(r.created_by),
      createdAt: asString(r.created_at),
    }),
  );

  const editItems: ApprovalItem[] = ((edits.data ?? []) as Raw[]).map((r) => {
    const payload = (r.request_payload ?? {}) as Raw;
    return {
      kind: "edit",
      approvalId: asNumber(r.id) ?? undefined,
      campaignId: String(r.campaign_id ?? ""),
      campaignName: asString(payload.campaignName),
      status: asString(r.status),
      keyMessage: asString(payload.keyMessage),
      budget: asNumber(payload.totalBudget),
      creators: asNumber(payload.numCreators),
      startDate: asString(payload.startDate),
      endDate: asString(payload.endDate),
      briefLink: asString(payload.briefLink),
      createdBy:
        asString(r.requested_by_name) ?? asString(r.requested_by_email),
      createdAt: asString(r.created_at),
      notes: asString(r.notes),
    };
  });

  const items = [...campaignItems, ...editItems].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });

  const history: ApprovalHistoryItem[] = ((logs.data ?? []) as Raw[]).map(
    (r) => {
      const action = String(r.action ?? "Changed");
      return {
        id: String(r.id ?? ""),
        actionType: String(r.action_type ?? "Approval"),
        action,
        entityId: String(r.entity_id ?? ""),
        actor:
          asString(r.admin_name) ??
          asString(r.admin_email) ??
          (action.toLowerCase().includes("submit") ? "CreatorHub" : "Admin"),
        notes: asString(r.notes),
        at: asString(r.timestamp),
        status: historyStatus(action),
      };
    },
  );

  return {
    items,
    total: items.length,
    history,
    historyTotal: history.length,
  };
}
