import { NextResponse } from "next/server";
import { assertPermission } from "@/lib/rbac.server";
import { fetchAccountsHubData } from "@/features/accounts-hub/queries";

/**
 * GET /api/accounts/export?mode=due|paid|all
 *
 * Streams a CSV download mirroring legacy `exportPayments`. Cols match the
 * legacy Accounts Hub sheet ordering for operator continuity.
 */
const MODES = new Set(["due", "paid", "all"]);

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: Request) {
  try {
    await assertPermission("accounts_write");
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const mode = (url.searchParams.get("mode") ?? "all").toLowerCase();
  if (!MODES.has(mode)) {
    return NextResponse.json(
      { error: "mode must be due | paid | all" },
      { status: 400 },
    );
  }

  const { rows } = await fetchAccountsHubData({});
  const filtered = rows.filter((r) => {
    const status = r.payment?.status ?? "";
    // "due" = the disbursement worklist. Partial collabs carry an outstanding
    // balance, so they belong in the next run alongside Due / Not Due.
    if (mode === "due")
      return status === "Due" || status === "Not Due" || status === "Partial";
    if (mode === "paid") return status === "Done";
    return true;
  });

  const header = [
    "Post ID",
    "Influencer Name",
    "Username",
    "Campaign",
    "Amount",
    "Paid So Far",
    "Outstanding",
    "UTR",
    "Payment Date",
    "Status",
    "Due Date",
    "Estimated Payable Date",
    "Match Status",
    "Logged By",
    "Created At",
  ];

  const lines = [header.map(csvEscape).join(",")];
  for (const r of filtered) {
    const commercial = Number(r.commercial_amount ?? 0);
    // Paid-so-far sums every installment of the collab (partial-payments
    // model); fall back to the latest payment amount for legacy single rows.
    const paid = Number(r._paidSoFar ?? r.payment?.amount ?? 0);
    const outstanding = Number(
      r._remainder ?? Math.max(0, commercial - paid),
    );
    const matchStatus =
      paid > 0 && commercial > 0
        ? paid + 0.0001 >= commercial
          ? "Matched with Creator Hub"
          : "Not Matched with Creator Hub"
        : "Unverified";

    lines.push(
      [
        r.post_id_short ?? r.post_id,
        r.creator?.inf_name ?? "",
        r.creator?.username ?? "",
        r.campaign?.campaign_id ?? "",
        r.commercial_amount ?? r.payment?.amount ?? "",
        paid,
        outstanding,
        r.payment?.utr ?? "",
        r.payment?.payment_date ?? "",
        r.payment?.status ?? "",
        r.payment?.due_date ?? "",
        r.payment?.estimated_payable_date ?? "",
        matchStatus,
        r.payment?.logged_by ?? "",
        r.payment?.created_at ?? "",
      ]
        .map(csvEscape)
        .join(","),
    );
  }

  const csv = lines.join("\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="accounts-${mode}-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
