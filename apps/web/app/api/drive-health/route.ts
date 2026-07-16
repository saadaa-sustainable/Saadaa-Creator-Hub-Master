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
  const secret = process.env.CRON_SECRET;
  const bearerOk =
    !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
  if (!bearerOk) {
    const actor = await getActor().catch(() => null);
    if (!actor || !hasPermission(actor, "admin")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const result = await driveHealthcheck();
  return NextResponse.json(result, { status: result.uploadOk ? 200 : 500 });
}
