import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const TERMS_ATTACHMENT = {
  fileName: "Saadaa_Influencer_TC.pdf",
  mimeType: "application/pdf",
  url: "/api/assets/saadaa-influencer-tc",
} as const;

// The PDF now lives INSIDE the repo (apps/web/legal) and is force-bundled into
// serverless functions via next.config `outputFileTracingIncludes`. Candidate
// paths cover: Vercel (cwd = app root), monorepo-root cwd, and the legacy
// out-of-repo location for local dev. First readable wins.
const TERMS_CANDIDATE_PATHS = [
  join(process.cwd(), "legal", "Saadaa_Influencer_TC.pdf"),
  join(process.cwd(), "apps", "web", "legal", "Saadaa_Influencer_TC.pdf"),
  join(process.cwd(), "..", "..", "..", "Saadaa_Influencer_TC.pdf"),
];

export async function readTermsAttachmentBuffer(): Promise<Buffer> {
  let lastErr: unknown = null;
  for (const p of TERMS_CANDIDATE_PATHS) {
    try {
      return await readFile(p);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("T&C PDF not found in any candidate path");
}

export async function readTermsAttachmentFile(): Promise<{
  fileName: string;
  mimeType: string;
  base64: string;
} | null> {
  try {
    const buffer = await readTermsAttachmentBuffer();
    return {
      fileName: TERMS_ATTACHMENT.fileName,
      mimeType: TERMS_ATTACHMENT.mimeType,
      base64: buffer.toString("base64"),
    };
  } catch {
    return null;
  }
}
