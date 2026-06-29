import { createServiceClient } from "@/lib/supabase/server";
import { getActor } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import type {
  SupportTicket,
  SupportTicketDeskData,
  TicketCategory,
  TicketCountKey,
  TicketPriority,
  TicketStatus,
} from "./types";

/**
 * Issue Desk data. Admins see every ticket; everyone else sees only the tickets
 * they raised. Counts drive the KPI strip. Read via the service client; the
 * page route already gates auth.
 */

const PAGE_LIMIT = 300;

type Raw = Record<string, unknown>;

export function mapTicket(r: Raw): SupportTicket {
  return {
    id: Number(r.id),
    ticketNo: String(r.ticket_no ?? `TKT-${String(r.id).padStart(5, "0")}`),
    title: String(r.title ?? ""),
    description: String(r.description ?? ""),
    category: (r.category as TicketCategory) ?? "other",
    priority: (r.priority as TicketPriority) ?? "medium",
    status: (r.status as TicketStatus) ?? "open",
    requesterName: (r.requester_name as string | null) ?? null,
    requesterEmail: (r.requester_email as string | null) ?? null,
    requesterRole: (r.requester_role as string | null) ?? null,
    sourcePath: (r.source_path as string | null) ?? null,
    assignedAdminEmail: (r.assigned_admin_email as string | null) ?? null,
    adminNote: (r.admin_note as string | null) ?? null,
    resolution: (r.resolution as string | null) ?? null,
    lastAdminResponseAt: (r.last_admin_response_at as string | null) ?? null,
    resolvedAt: (r.resolved_at as string | null) ?? null,
    closedAt: (r.closed_at as string | null) ?? null,
    createdAt: String(r.created_at ?? ""),
    updatedAt: String(r.updated_at ?? ""),
  };
}

export async function fetchSupportTicketDesk(): Promise<SupportTicketDeskData> {
  const actor = await getActor();
  const isAdmin = !!actor && hasPermission(actor, "admin");
  const svc = createServiceClient() as any;

  let query = svc
    .from("support_tickets")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(PAGE_LIMIT);

  if (!isAdmin && actor?.email) {
    query = query.eq("requester_email", actor.email.toLowerCase());
  }

  const { data, error } = await query;
  if (error) {
    console.error("[issue-desk] tickets query failed:", error.message);
  }

  const tickets = ((data ?? []) as Raw[]).map(mapTicket);

  const counts: Record<TicketCountKey, number> = {
    all: tickets.length,
    open: 0,
    in_progress: 0,
    resolved: 0,
    closed: 0,
    urgent: 0,
  };
  for (const t of tickets) {
    counts[t.status] += 1;
    if (t.priority === "urgent" && t.status !== "closed") counts.urgent += 1;
  }

  return { tickets, counts, isAdmin };
}
