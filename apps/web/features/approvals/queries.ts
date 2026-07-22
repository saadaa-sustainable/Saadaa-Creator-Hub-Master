import { createServiceClient } from "@/lib/supabase/server";
import {
  ONBOARDING_EDIT_DIFF_LABELS,
  ONBOARDING_EDIT_FIELD_LABELS,
  type OnboardingEditField,
  type OnboardingEditItem,
} from "@/features/onboarding/edit-fields";
import { buildCampaignChanges, type CampaignChange } from "./campaign-diff";
import type { TierLine } from "@/features/budget/types";

export type { OnboardingEditItem };

/**
 * Approvals queue — new campaigns, campaign edit requests, and onboarding edits
 * awaiting sign-off. Decisions are written to approval_logs, which also powers
 * the history table below and the global Audit Log.
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
  /** Edit requests only — before/after diff so admins see what changed
   *  BEFORE deciding (same table the onboarding-edit card renders). */
  changes?: CampaignChange[];
  /** Campaign cards only — its V0 budget is still pending with the Global
   *  Admins, so the campaign approval stays locked (budget first). */
  budgetPending?: boolean;
}

/** A budget version (V0 / top-up) awaiting Global Admin sign-off. */
export interface BudgetApprovalItem {
  versionId: number;
  campaignId: string;
  campaignName: string | null;
  versionNumber: number;
  kind: "initial" | "top_up" | "carry_forward";
  month: string;
  amount: number;
  numCreators: number;
  reason: string | null;
  createdBy: string | null;
  createdAt: string | null;
  /** The budget split behind this version — campaign_budget tier lines for a
   *  V0, the parked draft `lines` for a pending top-up. Shown on the approval
   *  card so Global Admins see exactly what they're sanctioning. */
  tierLines: TierLine[];
  /** Campaign context for the card's Overview / Brief / Edit actions. */
  campaign: {
    status: string | null;
    keyMessage: string | null;
    briefLink: string | null;
    startDate: string | null;
    endDate: string | null;
    totalBudget: number | null;
    creators: number | null;
    createdBy: string | null;
  } | null;
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
  requestId: string | null;
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
  budgets: BudgetApprovalItem[];
  onboardingEdits: OnboardingEditItem[];
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

  const [campaigns, edits, onboardingEditsRes, logs, pendingBudgets] =
    await Promise.all([
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
        "id, campaign_id, status, request_payload, before_payload, requested_by_email, requested_by_name, notes, created_at",
      )
      .eq("request_type", "edit")
      .eq("status", "Pending Approval")
      .order("created_at", { ascending: false })
      .limit(200),
    svc
      .from("onboarding_edit_requests")
      .select(
        "id, collab_id, inf_id, requested_by, requested_by_name, reason, before, after, created_at",
      )
      .eq("status", "Pending Approval")
      .order("created_at", { ascending: false })
      .limit(200),
    svc
      .from("approval_logs")
      .select(
        "id, action_type, action, entity_id, version_id, admin_email, admin_name, notes, timestamp",
      )
      .order("timestamp", { ascending: false })
      .limit(100),
    svc
      .from("campaign_budget_versions")
      .select(
        "id, campaign_id, version_number, kind, month, amount, num_creators, note, created_by, created_at, lines",
      )
      .eq("status", "pending_approval")
      .eq("is_test", false)
      .order("created_at", { ascending: false })
      .limit(200),
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

  // Pending budget versions (V0 + top-ups) — Global Admin queue. A campaign
  // whose V0 sits here has its own approval locked (budget first).
  const budgetRaw = ((pendingBudgets?.data ?? []) as Raw[]);
  const campaignNameById = new Map<string, string>();
  const campaignInfoById = new Map<string, Raw>();
  for (const r of (campaigns.data ?? []) as Raw[]) {
    campaignNameById.set(
      String(r.campaign_id ?? ""),
      String(r.campaign_name ?? ""),
    );
    campaignInfoById.set(String(r.campaign_id ?? ""), r);
  }
  const missingNames = [
    ...new Set(
      budgetRaw
        .map((r) => String(r.campaign_id ?? ""))
        .filter((id) => id && !campaignInfoById.has(id)),
    ),
  ];
  if (missingNames.length > 0) {
    // Top-ups belong to LIVE campaigns (not in the pending fetch) — pull the
    // same context fields for them.
    const { data: extraNames } = await svc
      .from("campaigns")
      .select(
        "campaign_id, campaign_name, status, key_message, total_budget, no_of_creators, start_date, end_date, brief_link, created_by",
      )
      .in("campaign_id", missingNames);
    for (const r of (extraNames ?? []) as Raw[]) {
      campaignNameById.set(
        String(r.campaign_id ?? ""),
        String(r.campaign_name ?? ""),
      );
      campaignInfoById.set(String(r.campaign_id ?? ""), r);
    }
  }
  // Budget split behind each pending version: a V0's tier lines already live
  // in campaign_budget (linked by version_id at submit); a pending top-up
  // parks its draft lines in the version's `lines` jsonb until approval.
  const pendingIds = budgetRaw
    .map((r) => asNumber(r.id))
    .filter((n): n is number => n != null && n > 0);
  const linesByVersion = new Map<number, TierLine[]>();
  if (pendingIds.length > 0) {
    const { data: budgetLines } = await svc
      .from("campaign_budget")
      .select(
        "id, version_id, tier, collab_type, num_influencers, avg_comp, total_cost, min_garments, max_garments, est_garment_cost, total_with_garments",
      )
      .in("version_id", pendingIds);
    for (const l of (budgetLines ?? []) as Raw[]) {
      const vid = asNumber(l.version_id);
      if (vid == null) continue;
      const list = linesByVersion.get(vid) ?? [];
      list.push(l as unknown as TierLine);
      linesByVersion.set(vid, list);
    }
  }
  const budgets: BudgetApprovalItem[] = budgetRaw.map((r) => {
    const versionId = asNumber(r.id) ?? 0;
    const stored = linesByVersion.get(versionId) ?? [];
    const drafts = Array.isArray(r.lines) ? (r.lines as TierLine[]) : [];
    return {
      versionId,
      campaignId: String(r.campaign_id ?? ""),
      campaignName: campaignNameById.get(String(r.campaign_id ?? "")) ?? null,
      versionNumber: asNumber(r.version_number) ?? 0,
      kind: (String(r.kind ?? "top_up") as BudgetApprovalItem["kind"]),
      month: String(r.month ?? ""),
      amount: asNumber(r.amount) ?? 0,
      numCreators: asNumber(r.num_creators) ?? 0,
      reason: asString(r.note),
      createdBy: asString(r.created_by),
      createdAt: asString(r.created_at),
      tierLines: stored.length > 0 ? stored : drafts,
      campaign: (() => {
        const c = campaignInfoById.get(String(r.campaign_id ?? ""));
        if (!c) return null;
        return {
          status: asString(c.status),
          keyMessage: asString(c.key_message),
          briefLink: asString(c.brief_link),
          startDate: asString(c.start_date),
          endDate: asString(c.end_date),
          totalBudget: asNumber(c.total_budget),
          creators: asNumber(c.no_of_creators),
          createdBy: asString(c.created_by),
        };
      })(),
    };
  });
  const pendingV0Campaigns = new Set(
    budgets.filter((b) => b.versionNumber === 0).map((b) => b.campaignId),
  );

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
      budgetPending: pendingV0Campaigns.has(String(r.campaign_id ?? "")),
    }),
  );

  const editItems: ApprovalItem[] = ((edits.data ?? []) as Raw[]).map((r) => {
    const payload = (r.request_payload ?? {}) as Raw;
    const beforePayload = (r.before_payload ?? {}) as Raw;
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
      changes: buildCampaignChanges(payload, beforePayload),
    };
  });

  const items = [...campaignItems, ...editItems].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });

  // Onboarding edits — build the before/after diff (changed fields only).
  const onbRaw = (onboardingEditsRes?.data ?? []) as Raw[];
  const editFields = Object.keys(
    ONBOARDING_EDIT_FIELD_LABELS,
  ) as OnboardingEditField[];
  const onbInfIds = [
    ...new Set(onbRaw.map((r) => asString(r.inf_id)).filter(Boolean)),
  ] as string[];
  const nameByInf = new Map<string, string>();
  if (onbInfIds.length > 0) {
    const { data: creators } = await svc
      .from("creators")
      .select("inf_id, inf_name")
      .in("inf_id", onbInfIds)
      .limit(2000);
    for (const c of (creators ?? []) as Raw[]) {
      const id = asString(c.inf_id);
      const nm = asString(c.inf_name);
      if (id && nm) nameByInf.set(id, nm);
    }
  }
  const onboardingEdits: OnboardingEditItem[] = onbRaw.map((r) => {
    const before = (r.before ?? {}) as Record<string, unknown>;
    const after = (r.after ?? {}) as Record<string, unknown>;
    const changes = editFields
      .map((f) => ({
        field: f,
        label: ONBOARDING_EDIT_DIFF_LABELS[f],
        before: String(before[f] ?? "").trim(),
        after: String(after[f] ?? "").trim(),
      }))
      .filter((c) => c.before !== c.after);
    const infId = asString(r.inf_id);
    const requestKey = String(r.collab_id ?? "");
    const kind = requestKey.startsWith("reachout:")
      ? "reachout"
      : "onboarding";
    return {
      id: asNumber(r.id) ?? 0,
      kind,
      collabId:
        kind === "reachout"
          ? `Reach Out #${requestKey.slice("reachout:".length)}`
          : requestKey.startsWith("legacy:")
            ? `Onboarding #${requestKey.slice("legacy:".length)}`
            : requestKey,
      creator: (infId && nameByInf.get(infId)) || infId || null,
      requestedBy:
        asString(r.requested_by_name) ?? asString(r.requested_by),
      reason: asString(r.reason),
      createdAt: asString(r.created_at),
      changes,
    };
  });

  const history: ApprovalHistoryItem[] = ((logs.data ?? []) as Raw[]).map(
    (r) => {
      const action = String(r.action ?? "Changed");
      const rawEntityId = String(r.entity_id ?? "");
      return {
        id: String(r.id ?? ""),
        requestId: asString(r.version_id),
        actionType: String(r.action_type ?? "Approval"),
        action,
        entityId: rawEntityId.startsWith("reachout:")
          ? `Reach Out #${rawEntityId.slice("reachout:".length)}`
          : rawEntityId,
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
    budgets,
    onboardingEdits,
    history,
    historyTotal: history.length,
  };
}
