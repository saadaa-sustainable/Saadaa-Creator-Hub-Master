import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { sendMail } from "@/lib/email";
import {
  fetchChangelogRows,
  normalizeChangelogDate,
} from "@/lib/gdoc-changelog";
import { buildChangelogPdf } from "@/lib/changelog-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily change-log report — runs at 18:30 UTC (= 00:00 IST, "12 AM") via
 * vercel.json and emails a 1-pager of everything shipped that day (the day
 * that just ended in IST) to the project owner, with an interactive PDF
 * attached (clickable commit refs → GitHub).
 *
 * Source of truth: the Google Doc Change Log table ("Workflow & Tools Master"
 * › "Influencer - Technical Design") — the standing registry every shippable
 * change appends to.
 *
 * Manual/test: GET ?date=2026-07-16 with admin session or
 * `Authorization: Bearer ${CRON_SECRET|SUPABASE_SERVICE_KEY}`.
 */

const RECIPIENT = "devesh@saadaa.in";

function istDateOffset(daysBack: number): string {
  const now = new Date(Date.now() - daysBack * 86_400_000);
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function prettyDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

const escHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secrets = [
    process.env.CRON_SECRET,
    process.env.SUPABASE_SERVICE_KEY,
  ].filter((s): s is string => Boolean(s?.trim()));
  const bearerOk = secrets.some((s) => auth === `Bearer ${s}`);
  if (!bearerOk) {
    const actor = await getActor().catch(() => null);
    if (!actor || !hasPermission(actor, "admin")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  // Cron fires at 00:00 IST — report the day that just ended (IST yesterday).
  // ?date=YYYY-MM-DD overrides for tests/backfills.
  const url = new URL(req.url);
  const dateParam = (url.searchParams.get("date") ?? "").trim();
  const targetIso = normalizeChangelogDate(dateParam) ?? istDateOffset(1);

  const all = await fetchChangelogRows();
  if (all.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Change log could not be read from the Google Doc" },
      { status: 502 },
    );
  }
  const entries = all
    .filter((r) => r.dateIso === targetIso)
    .map((r) => ({ change: r.change, ref: r.ref }))
    // The GDoc table inserts newest below the header — reverse so the email
    // reads in shipping order.
    .reverse();

  const dateLabel = prettyDate(targetIso);
  const generatedAt = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const pdf = buildChangelogPdf({ dateLabel, entries, generatedAt });

  const repo =
    "https://github.com/saadaa-sustainable/Saadaa-Creator-Hub-Master";
  const items = entries
    .map((e, i) => {
      const refs = e.ref
        .split(/[\s,]+/)
        .filter((r) => /^[0-9a-f]{7,10}$/i.test(r))
        .map(
          (r) =>
            `<a href="${repo}/commit/${r}" style="color:#3B6FD4;font-family:ui-monospace,Menlo,monospace;font-size:11px;text-decoration:none;">${r}</a>`,
        )
        .join(" · ");
      return `<tr>
<td style="vertical-align:top;padding:10px 10px 10px 0;width:26px;">
  <span style="display:inline-block;background:#F0C61E;color:#161513;font-weight:800;font-size:11px;border-radius:6px;padding:2px 7px;">${i + 1}</span>
</td>
<td style="padding:10px 0;border-bottom:1px solid #EFEAE0;">
  <div style="font-size:13px;line-height:1.55;color:#161513;">${escHtml(e.change)}</div>
  ${refs ? `<div style="margin-top:4px;font-size:11px;color:#9A9384;">Commits: ${refs}</div>` : ""}
</td></tr>`;
    })
    .join("");

  const html = `<div style="max-width:640px;margin:0 auto;font-family:Inter,-apple-system,Segoe UI,sans-serif;background:#FAF8F5;border:1px solid #E7E2D2;border-radius:16px;overflow:hidden;">
<div style="background:#2C2420;padding:22px 26px;border-bottom:4px solid #F0C61E;">
  <div style="color:#FFFDF6;font-size:18px;font-weight:800;">Daily Change Log</div>
  <div style="color:#F0C61E;font-size:13px;margin-top:4px;">${dateLabel}</div>
  <div style="color:#CFC8BC;font-size:11px;margin-top:2px;">${entries.length} change${entries.length === 1 ? "" : "s"} shipped · Saadaa CreatorHub</div>
</div>
<div style="padding:10px 26px 20px;">
  ${
    entries.length === 0
      ? `<p style="color:#6E695E;font-size:13px;">No changes were logged for this day.</p>`
      : `<table style="width:100%;border-collapse:collapse;">${items}</table>`
  }
  <p style="margin:16px 0 0;color:#9A9384;font-size:11px;">The attached PDF is the shareable 1-pager — commit refs in it are clickable. Full history lives in the "Influencer - Technical Design" doc.</p>
</div>
</div>`;

  const result = await sendMail({
    to: RECIPIENT,
    subject: `CreatorHub change log — ${dateLabel} (${entries.length} change${entries.length === 1 ? "" : "s"})`,
    htmlBody: html,
    attachments: [
      {
        fileName: `creatorhub-changelog-${targetIso}.pdf`,
        mimeType: "application/pdf",
        base64: pdf.toString("base64"),
      },
    ],
  });

  return NextResponse.json(
    {
      ok: result.ok,
      date: targetIso,
      entries: entries.length,
      to: RECIPIENT,
      error: result.error,
    },
    { status: result.ok ? 200 : 500 },
  );
}
