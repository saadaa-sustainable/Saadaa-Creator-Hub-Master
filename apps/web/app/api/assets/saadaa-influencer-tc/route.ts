import { readTermsAttachmentBuffer, TERMS_ATTACHMENT } from "@/lib/attachments";
import { assertPermission } from "@/lib/rbac.server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await assertPermission("onboarding_write");
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const buffer = await readTermsAttachmentBuffer();

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="${TERMS_ATTACHMENT.fileName}"`,
        "Content-Type": TERMS_ATTACHMENT.mimeType,
      },
    });
  } catch {
    return new Response("T&C document not found", { status: 404 });
  }
}
