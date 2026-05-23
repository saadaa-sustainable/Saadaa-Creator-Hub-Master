import { NextResponse } from "next/server";
import { assertPermission } from "@/lib/rbac.server";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * GET /api/accounts/post-deliverables/[postId]
 *
 * Returns the clicked post + its sibling deliverables (parent + children for
 * the same `(inf_id, collab_number)` collab), each with its payment row when
 * one exists. The Accounts Hub overview modal uses this to render a
 * per-deliverable payment ledger for the operator.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  try {
    await assertPermission("accounts_write");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { postId } = await params;
  if (!postId) {
    return NextResponse.json({ error: "postId missing" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: parent, error: parentErr } = await (supabase as any)
    .from("posts")
    .select(
      `
      post_id, post_id_short, workflow_status, content_type, nomenclature,
      collab_type, commercial_amount, barter_amount,
      reels, static_posts, stories,
      ads_usage_rights, partnership_id, ad_partnership_valid,
      post_link, post_date, onboard_date, est_delivery,
      deliverable_index, deliverable_type, collab_number, inf_id, campaign_id,
      bank_name, bank_number, ifsc,
      campaign:campaigns ( campaign_id, campaign_name ),
      creator:creators  ( inf_id, username, inf_name, profile_pic, category, followers, verification )
    `,
    )
    .eq("post_id", postId)
    .maybeSingle();

  if (parentErr) {
    return NextResponse.json({ error: parentErr.message }, { status: 500 });
  }
  if (!parent) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  // Fetch all siblings sharing (inf_id, collab_number) — parent + children.
  let deliverables: Array<Record<string, unknown>> = [];
  if (parent.inf_id) {
    const { data: sibs } = await (supabase as any)
      .from("posts")
      .select(
        `
        post_id, post_id_short, workflow_status, deliverable_index, deliverable_type,
        reels, static_posts, stories, ads_usage_rights, partnership_id,
        ad_partnership_valid, post_link, post_date, payment_status,
        commercial_amount, content_type, nomenclature
      `,
      )
      .eq("inf_id", parent.inf_id)
      .eq("collab_number", Number(parent.collab_number ?? 1))
      .order("deliverable_index", { ascending: true, nullsFirst: true });
    deliverables = (sibs ?? []) as Array<Record<string, unknown>>;
  } else {
    deliverables = [parent as Record<string, unknown>];
  }

  // Pull latest payment row per post_id in the deliverable set.
  const postIds = deliverables
    .map((d) => d.post_id)
    .filter((id): id is string => typeof id === "string");

  let paymentsByPostId = new Map<string, Record<string, unknown>>();
  if (postIds.length > 0) {
    const { data: pays } = await (supabase as any)
      .from("payments")
      .select("*")
      .in("post_id", postIds)
      .order("created_at", { ascending: false });
    for (const p of (pays ?? []) as Array<Record<string, unknown>>) {
      const pid = String(p.post_id ?? "");
      if (!paymentsByPostId.has(pid)) paymentsByPostId.set(pid, p);
    }
  }

  // Annotate each deliverable with its payment row + computed split amount.
  const totalCount = deliverables.length;
  const commercialTotal = Number(parent.commercial_amount ?? 0);
  const perDeliverableAmount =
    totalCount > 0 ? commercialTotal / totalCount : commercialTotal;

  const enriched = deliverables.map((d, idx) => ({
    ...d,
    is_parent:
      d.deliverable_index == null || Number(d.deliverable_index) === 1,
    deliverable_label: deliverableLabel(d, idx),
    split_amount: perDeliverableAmount,
    payment: paymentsByPostId.get(String(d.post_id)) ?? null,
  }));

  return NextResponse.json({
    parent,
    deliverables: enriched,
    summary: {
      totalDeliverables: totalCount,
      commercialTotal,
      perDeliverableAmount,
      hasAdsRights:
        !!parent.ads_usage_rights &&
        !["", "no", "n/a", "none", "0", "false"].includes(
          String(parent.ads_usage_rights).trim().toLowerCase(),
        ),
    },
  });
}

function deliverableLabel(
  d: Record<string, unknown>,
  fallbackIdx: number,
): string {
  const type = String(d.deliverable_type ?? "").toLowerCase();
  const idx = Number(d.deliverable_index ?? fallbackIdx + 1);
  if (type === "reel") return `Reel #${idx}`;
  if (type === "post") return `Static Post #${idx}`;
  if (type === "story") return `Story #${idx}`;
  // Fallback: infer from counts on the row itself.
  const reels = Number(d.reels ?? 0);
  const posts = Number(d.static_posts ?? 0);
  const stories = Number(d.stories ?? 0);
  if (reels > 0) return `Reel #${idx}`;
  if (posts > 0) return `Static Post #${idx}`;
  if (stories > 0) return `Story #${idx}`;
  return `Deliverable #${idx}`;
}
