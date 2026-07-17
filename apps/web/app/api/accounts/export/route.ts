import { NextResponse } from "next/server";
import { assertPermission } from "@/lib/rbac.server";
import { isVoidedStatus } from "@/lib/workflow";
import { fetchAccountsHubData } from "@/features/accounts-hub/queries";

/**
 * GET /api/accounts/export?mode=due|paid|all|partial
 *
 * Streams a CSV download mirroring legacy `exportPayments`. Cols match the
 * legacy Accounts Hub sheet ordering for operator continuity. `partial` = only
 * collabs with an outstanding balance (an installment paid, agreed total unmet).
 */
const MODES = new Set(["due", "paid", "all", "partial"]);

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
      { error: "mode must be due | paid | all | partial" },
      { status: 400 },
    );
  }

  // includeVoided so offboarded collabs' already-disbursed money survives in the
  // Paid / All exports (finance history). The Due worklist still drops them.
  const { rows } = await fetchAccountsHubData({}, { includeVoided: true });
  const filtered = rows.filter((r) => {
    const status = r.payment?.status ?? "";
    // "due" = the disbursement worklist. Partial collabs carry an outstanding
    // balance, so they belong in the next run alongside Due / Not Due. Voided
    // (offboarded) collabs can never be paid — never list them here.
    if (mode === "due")
      return (
        !isVoidedStatus(r.workflow_status) &&
        (status === "Due" || status === "Not Due" || status === "Partial")
      );
    if (mode === "paid") return status === "Done";
    // "partial" = outstanding-balance collabs only (installment paid, total unmet).
    if (mode === "partial")
      return !isVoidedStatus(r.workflow_status) && r._isPartial === true;
    return true;
  });

  // Match Status (UTR ↔ ledger verification) only means something once money
  // moved — the Due worklist is pre-payment, so the column is dropped there.
  const withMatch = mode !== "due";
  const header = [
    "Post ID",
    "Collab ID",
    "Influencer Name",
    "Username",
    "Profile URL",
    "Campaign",
    "Amount",
    "Paid So Far",
    "Outstanding",
    "UTR",
    "Payment Date",
    "Status",
    "Due Date",
    "Estimated Payable Date",
    ...(withMatch ? ["Match Status"] : []),
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

    const username = r.creator?.username ?? "";
    const profileUrl = username
      ? `https://www.instagram.com/${username.replace(/^@/, "")}/`
      : "";
    const collabId =
      r.collab_id ??
      (r.inf_id ? `${r.inf_id}-C${Number(r.collab_number ?? 1)}` : "");

    lines.push(
      [
        r.post_id_short ?? r.post_id,
        collabId,
        r.creator?.inf_name ?? "",
        username,
        profileUrl,
        r.campaign?.campaign_id ?? "",
        r.commercial_amount ?? r.payment?.amount ?? "",
        paid,
        outstanding,
        r.payment?.utr ?? "",
        r.payment?.payment_date ?? "",
        r.payment?.status ?? "",
        r.payment?.due_date ?? "",
        r.payment?.estimated_payable_date ?? "",
        ...(withMatch ? [matchStatus] : []),
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
