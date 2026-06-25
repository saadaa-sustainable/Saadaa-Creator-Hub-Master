"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getActor } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { CONTENT_CODES } from "./content-codes";

/**
 * Historic Creator picker — read-only browser over the `list_historic_creators`
 * RPC. Gated behind the same permissions that let a user submit a reach-out
 * (outbound OR inbound), since the picker only surfaces on those forms.
 */

const PAGE_SIZE = 60;

async function assertReachOutAccess(): Promise<void> {
  const actor = await getActor();
  if (
    !actor ||
    !(
      hasPermission(actor, "reachout_outbound") ||
      hasPermission(actor, "reachout_inbound")
    )
  ) {
    throw new Error("Forbidden");
  }
}

export interface HistoricCreatorRow {
  inf_id: string;
  username: string;
  inf_name: string | null;
  followers: number | null;
  category: string | null;
  profile_pic: string | null;
  creator_type: string;
}

export interface HistoricCreatorFilters {
  search?: string;
  contentType?: string;
  tier?: string;
  campaign?: string;
  team?: string;
  page?: number;
}

export async function listHistoricCreators(
  f: HistoricCreatorFilters,
): Promise<{
  rows: HistoricCreatorRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  await assertReachOutAccess();

  const page = f.page && f.page > 0 ? f.page : 1;
  const offset = (page - 1) * PAGE_SIZE;

  const { data, error } = await (createServiceClient() as any).rpc(
    "list_historic_creators",
    {
      p_search: f.search || null,
      p_content_type: f.contentType || null,
      p_tier: f.tier || null,
      p_campaign: f.campaign || null,
      p_team: f.team || null,
      p_limit: PAGE_SIZE,
      p_offset: offset,
    },
  );

  if (error) {
    throw new Error(error.message ?? "Failed to load historic creators");
  }

  const records = (data ?? []) as Array<
    HistoricCreatorRow & { total_count: number | string | null }
  >;
  const total = Number(records[0]?.total_count ?? 0) || 0;

  const rows: HistoricCreatorRow[] = records.map((r) => ({
    inf_id: r.inf_id,
    username: r.username,
    inf_name: r.inf_name,
    followers: r.followers,
    category: r.category,
    profile_pic: r.profile_pic,
    creator_type: r.creator_type,
  }));

  return { rows, total, page, pageSize: PAGE_SIZE };
}

/**
 * Prior-collab summary for a batch of creators, keyed by inf_id. Powers the
 * collab-history line + "next C{n}" hint in the Historic Creator picker. Backed
 * by the `prior_collab_summary` RPC, which already folds in the
 * reach-out-only-historic → C2 rule via `next_collab`.
 */
export async function historicCreatorCollabSummary(
  infIds: string[],
): Promise<Record<string, { count: number; ids: string[]; next: number }>> {
  await assertReachOutAccess();

  const ids = Array.from(
    new Set((infIds ?? []).filter((v): v is string => typeof v === "string" && v.trim() !== "")),
  );
  if (ids.length === 0) return {};

  const { data, error } = await (createServiceClient() as any).rpc(
    "prior_collab_summary",
    { p_inf_ids: ids },
  );

  if (error) {
    throw new Error(error.message ?? "Failed to load collab summaries");
  }

  const out: Record<string, { count: number; ids: string[]; next: number }> = {};
  for (const r of (data ?? []) as Array<{
    inf_id: string;
    prior_count: number | string | null;
    collab_ids: string[] | null;
    next_collab: number | string | null;
  }>) {
    out[r.inf_id] = {
      count: Number(r.prior_count ?? 0) || 0,
      ids: Array.isArray(r.collab_ids) ? r.collab_ids : [],
      next: Number(r.next_collab ?? 0) || 0,
    };
  }
  return out;
}

export async function historicCreatorFilterOptions(): Promise<{
  tiers: string[];
  contentTypes: { value: string; label: string }[];
  campaigns: { value: string; label: string }[];
  teamMembers: string[];
}> {
  await assertReachOutAccess();

  const svc = createServiceClient() as any;

  const tiers = ["Nano", "Micro", "Mid tier", "Macro", "Mega"];

  const contentTypes = CONTENT_CODES.map((code) => ({
    value: code.code,
    label: code.name,
  }));

  const { data: campRows } = await svc
    .from("campaigns")
    .select("campaign_id, campaign_name")
    .order("campaign_id");

  const campaigns = ((campRows ?? []) as Array<{
    campaign_id: string;
    campaign_name: string | null;
  }>).map((c) => ({
    value: c.campaign_id,
    label:
      c.campaign_id +
      (c.campaign_name && c.campaign_name !== c.campaign_id
        ? ` · ${c.campaign_name}`
        : ""),
  }));

  const { data: postRows } = await svc.from("posts").select("onboarded_by");

  const teamMembers = Array.from(
    new Set(
      ((postRows ?? []) as Array<{ onboarded_by: string | null }>)
        .map((p) => p.onboarded_by)
        .filter((v): v is string => typeof v === "string" && v.trim() !== ""),
    ),
  ).sort((a, b) => a.localeCompare(b));

  return { tiers, contentTypes, campaigns, teamMembers };
}
