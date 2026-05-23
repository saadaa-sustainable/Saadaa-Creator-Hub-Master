import { NextResponse } from "next/server";
import { assertPermission } from "@/lib/rbac.server";
import { fetchPayableEligiblePosts } from "@/features/accounts-hub/queries";

/**
 * GET /api/accounts/eligible-posts — list of payable Posted/Delivered parent
 * posts. Used by the payment-entry modal dropdown. Mirrors legacy
 * `getPayableEligiblePosts`.
 */
export async function GET() {
  try {
    await assertPermission("accounts_write");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const rows = await fetchPayableEligiblePosts();
    return NextResponse.json({ rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
