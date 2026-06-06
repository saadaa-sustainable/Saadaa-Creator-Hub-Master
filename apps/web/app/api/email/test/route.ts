import { NextRequest, NextResponse } from "next/server";
import { serverEnv } from "@/lib/env.server";
import { sendNotification } from "@/lib/notifications";

/**
 * SMTP smoke-test route — confirms the Gmail credentials (EMAIL_USER /
 * EMAIL_PASS / EMAIL_FROM_NAME) are wired correctly in the running deployment,
 * WITHOUT firing the daily cron (which mails real creators + the team).
 *
 * It sends ONE branded email through the exact production path
 * (sendNotification → wrapNotificationHtml → sendMail → email_logs audit) so a
 * success here proves every layer the real notifications use.
 *
 * AUTH: same guard as the cron — `Authorization: Bearer ${CRON_SECRET}`. If
 * CRON_SECRET is unset the route is disabled (503) so it can never become an
 * open self-mailer. Default recipient is the Saadaa admin; override with `?to=`
 * (already auth-gated).
 *
 * Usage:
 *   curl -i -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/email/test
 *   curl -i -H "Authorization: Bearer $CRON_SECRET" "https://<domain>/api/email/test?to=you@x.com"
 */

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DEFAULT_RECIPIENT = "website@saadaa.in";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not set — test route disabled." },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Surface config presence (booleans only — never echo secret values).
  const config = {
    EMAIL_USER: Boolean(serverEnv.EMAIL_USER),
    EMAIL_PASS: Boolean(serverEnv.EMAIL_PASS),
    EMAIL_FROM_NAME: serverEnv.EMAIL_FROM_NAME ?? "(default: Saadaa)",
  };
  if (!config.EMAIL_USER || !config.EMAIL_PASS) {
    return NextResponse.json(
      {
        ok: false,
        error: "EMAIL_USER / EMAIL_PASS not configured in this deployment.",
        config,
      },
      { status: 200 },
    );
  }

  const to = req.nextUrl.searchParams.get("to")?.trim() || DEFAULT_RECIPIENT;
  const stamp = new Date().toISOString();

  const result = await sendNotification({
    type: "smtp_test",
    to,
    subject: "CreatorHub SMTP test",
    title: "SMTP test successful",
    subtitle: "CreatorHub email configuration",
    htmlBody: `
      <p style="margin:0 0 12px;">This is a test email from CreatorHub.</p>
      <p style="margin:0 0 12px;">If you can read this, the Gmail SMTP
      credentials (<strong>EMAIL_USER</strong> / <strong>EMAIL_PASS</strong>)
      are configured correctly and the notification path works end to end.</p>
      <p style="margin:0;color:#6E695E;font-size:0.82rem;">Sent at ${stamp}</p>
    `,
    plainBody: `CreatorHub SMTP test. Email configuration works. Sent at ${stamp}.`,
  });

  return NextResponse.json(
    {
      ok: result.ok,
      sent: result.sent,
      to,
      error: result.error,
      config,
      sentAt: stamp,
    },
    { status: result.ok ? 200 : 502 },
  );
}
