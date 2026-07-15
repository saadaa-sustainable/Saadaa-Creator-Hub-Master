import "server-only";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "./supabase/server";

/**
 * Pending-approvals badge count (topbar bell + sidebar Approvals pill).
 *
 * Cached with the "approvals-count" tag so the app shell NEVER does a per-nav
 * DB read (nav-perf rule): every approval mutation calls
 * `revalidateTag("approvals-count")` and the next render re-counts. Counts the
 * three pending queues shown on /approvals: new campaigns, campaign edit
 * requests, onboarding edit requests.
 */
export const getPendingApprovalsCount = unstable_cache(
  async (): Promise<number> => {
    try {
      const supabase = createServiceClient() as any;
      const [campaigns, campaignEdits, onboardingEdits, budgetVersions] =
        await Promise.all([
          supabase
            .from("campaigns")
            .select("campaign_id", { count: "exact", head: true })
            .ilike("status", "pending%"),
          supabase
            .from("campaign_approval_requests")
            .select("id", { count: "exact", head: true })
            .eq("status", "Pending Approval"),
          supabase
            .from("onboarding_edit_requests")
            .select("id", { count: "exact", head: true })
            .eq("status", "Pending Approval"),
          supabase
            .from("campaign_budget_versions")
            .select("id", { count: "exact", head: true })
            .eq("status", "pending_approval")
            .eq("is_test", false),
        ]);
      return (
        (campaigns.count ?? 0) +
        (campaignEdits.count ?? 0) +
        (onboardingEdits.count ?? 0) +
        (budgetVersions.count ?? 0)
      );
    } catch {
      return 0;
    }
  },
  ["approvals-count"],
  { tags: ["approvals-count"] },
);
