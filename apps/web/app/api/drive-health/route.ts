import { NextResponse, type NextRequest } from "next/server";
import { getActor } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { driveHealthcheck } from "@/lib/google-drive";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Drive automation self-test — proves the PROD runtime can do everything a
 * posting submit's Drive step needs (env → delegated token → parent folder →
 * upload → cleanup) without submitting anything. Admin session or
 * `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(req: NextRequest) {
  // CRON_SECRET is stored Sensitive on Vercel (unpullable), so the service
  // key — which any legit operator already holds — is accepted too.
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

  const result = await driveHealthcheck();
  return NextResponse.json(result, { status: result.uploadOk ? 200 : 500 });
}
