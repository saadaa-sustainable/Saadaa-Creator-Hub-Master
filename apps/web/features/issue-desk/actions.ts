"use server";

import { revalidatePath } from "next/cache";
import { requireActor } from "@/lib/auth";
import { assertPermission } from "@/lib/rbac.server";
import { createServiceClient } from "@/lib/supabase/server";
import { mapTicket } from "./queries";
import type {
  SupportTicket,
  TicketCategory,
  TicketPriority,
  TicketReference,
  TicketStatus,
} from "./types";

const CATEGORIES: TicketCategory[] = [
  "workflow",
  "access",
  "data",
  "bug",
  "suggestion",
  "other",
];
const PRIORITIES: TicketPriority[] = ["low", "medium", "high", "urgent"];
const STATUSES: TicketStatus[] = ["open", "in_progress", "resolved", "closed"];

type ActionResult =
  | { ok: true; ticket: SupportTicket }
  | { ok: false; error: string };

/** Anyone authenticated can raise a ticket. */
export async function createSupportTicket(input: {
  title: string;
  description: string;
  category: string;
  priority: string;
  sourcePath?: string | null;
}): Promise<ActionResult> {
  const actor = await requireActor();

  const title = (input.title ?? "").trim();
  const description = (input.description ?? "").trim();
  if (title.length < 4) return { ok: false, error: "Title is too short (min 4 characters)." };
  if (description.length < 12)
    return { ok: false, error: "Please add a bit more detail (min 12 characters)." };
  if (title.length > 140) return { ok: false, error: "Title is too long (max 140)." };
  if (description.length > 4000)
    return { ok: false, error: "Details are too long (max 4000)." };

  const category = CATEGORIES.includes(input.category as TicketCategory)
    ? (input.category as TicketCategory)
    : "other";
  const priority = PRIORITIES.includes(input.priority as TicketPriority)
    ? (input.priority as TicketPriority)
    : "medium";

  const svc = createServiceClient() as any;
  const { data, error } = await svc
    .from("support_tickets")
    .insert({
      title,
      description,
      category,
      priority,
      source_path: (input.sourcePath ?? "").trim() || null,
      requester_email: (actor as any).email ?? null,
      requester_name: (actor as any).name ?? null,
      requester_role: (actor as any).role ?? null,
    })
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/issue-desk");
  return { ok: true, ticket: mapTicket(data) };
}

/** Admins resolve: status + admin note + resolution. */
export async function updateSupportTicket(input: {
  id: number;
  status: string;
  adminNote?: string | null;
  resolution?: string | null;
}): Promise<ActionResult> {
  const actor = await assertPermission("admin");

  if (!STATUSES.includes(input.status as TicketStatus))
    return { ok: false, error: "Invalid status." };
  const status = input.status as TicketStatus;
  const nowIso = new Date().toISOString();

  const patch: Record<string, unknown> = {
    status,
    admin_note: (input.adminNote ?? "").trim() || null,
    resolution: (input.resolution ?? "").trim() || null,
    assigned_admin_email: (actor as any).email ?? null,
    last_admin_response_at: nowIso,
  };
  if (status === "resolved") patch.resolved_at = nowIso;
  else if (status === "closed") patch.closed_at = nowIso;
  else {
    patch.resolved_at = null;
    patch.closed_at = null;
  }

  const svc = createServiceClient() as any;
  const { data, error } = await svc
    .from("support_tickets")
    .update(patch)
    .eq("id", input.id)
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/issue-desk");
  return { ok: true, ticket: mapTicket(data) };
}

/**
 * Autocomplete for the "Linked record" field — matches CreatorHub entities a
 * ticket might reference: campaigns, creators (SIF / @handle), collabs.
 */
export async function searchTicketReferences(
  query: string,
): Promise<TicketReference[]> {
  await requireActor();
  const q = (query ?? "").trim();
  if (q.length < 2) return [];
  const like = `%${q}%`;
  const svc = createServiceClient() as any;

  const [camps, creators, posts] = await Promise.all([
    svc
      .from("campaigns")
      .select("campaign_id, campaign_name")
      .or(`campaign_id.ilike.${like},campaign_name.ilike.${like}`)
      .limit(5),
    svc
      .from("creators")
      .select("inf_id, username, inf_name")
      .or(`inf_id.ilike.${like},username.ilike.${like},inf_name.ilike.${like}`)
      .limit(6),
    svc
      .from("posts")
      .select("collab_id")
      .not("collab_id", "is", null)
      .ilike("collab_id", like)
      .limit(5),
  ]);

  const out: TicketReference[] = [];
  for (const c of (camps.data ?? []) as Array<{ campaign_id: string; campaign_name: string | null }>) {
    out.push({
      type: "campaign",
      id: c.campaign_id,
      label: `${c.campaign_id}${c.campaign_name ? ` · ${c.campaign_name}` : ""}`,
    });
  }
  for (const c of (creators.data ?? []) as Array<{ inf_id: string; username: string | null; inf_name: string | null }>) {
    out.push({
      type: "creator",
      id: c.inf_id,
      label: `${c.inf_id}${c.username ? ` · @${c.username}` : c.inf_name ? ` · ${c.inf_name}` : ""}`,
    });
  }
  const seenCollab = new Set<string>();
  for (const p of (posts.data ?? []) as Array<{ collab_id: string | null }>) {
    const id = (p.collab_id ?? "").trim();
    if (!id || seenCollab.has(id)) continue;
    seenCollab.add(id);
    out.push({ type: "collab", id, label: id });
  }
  return out;
}
