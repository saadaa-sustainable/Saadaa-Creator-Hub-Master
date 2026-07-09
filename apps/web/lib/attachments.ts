import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const TERMS_ATTACHMENT = {
  fileName: "Saadaa_Influencer_TC.pdf",
  mimeType: "application/pdf",
  url: "/api/assets/saadaa-influencer-tc",
} as const;

// PRIMARY source: the T&C PDF in Google Drive, so the team can update it without
// a redeploy. Set TERMS_DRIVE_FILE_ID to the Drive file ID; the file MUST be
// shared "Anyone with the link — Viewer" (the public download endpoint 403s
// otherwise). Defaults to the copy owned by marketing@saadaa.in.
const TERMS_DRIVE_FILE_ID = (
  process.env.TERMS_DRIVE_FILE_ID ?? "1mmvPHCRGvoc2RDcizGT6_9o3J5bb-9t8"
).trim();

// FALLBACK: the PDF bundled inside the repo (apps/web/legal), force-bundled into
// serverless functions via next.config `outputFileTracingIncludes`. Guarantees
// the email never ships without the T&C even if the Drive file is unshared /
// moved / deleted. Candidate paths cover Vercel (cwd = app root), monorepo-root
// cwd, and the legacy out-of-repo location for local dev. First readable wins.
const TERMS_CANDIDATE_PATHS = [
  join(process.cwd(), "legal", "Saadaa_Influencer_TC.pdf"),
  join(process.cwd(), "apps", "web", "legal", "Saadaa_Influencer_TC.pdf"),
  join(process.cwd(), "..", "..", "..", "Saadaa_Influencer_TC.pdf"),
];

async function fetchTermsFromDrive(): Promise<Buffer | null> {
  if (!TERMS_DRIVE_FILE_ID) return null;
  try {
    const url = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(TERMS_DRIVE_FILE_ID)}`;
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    // Google returns a small HTML "virus scan / sign-in" interstitial (not the
    // PDF) when a file is not publicly shared. Reject anything that isn't a PDF.
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("text/html")) return null;
    if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") return null;
    return buffer;
  } catch {
    return null;
  }
}

async function readTermsFromRepo(): Promise<Buffer | null> {
  for (const p of TERMS_CANDIDATE_PATHS) {
    try {
      return await readFile(p);
    } catch {
      // try next candidate
    }
  }
  return null;
}

export async function readTermsAttachmentBuffer(): Promise<Buffer> {
  const buffer = (await fetchTermsFromDrive()) ?? (await readTermsFromRepo());
  if (!buffer) throw new Error("T&C PDF not found (Drive + bundled both failed)");
  return buffer;
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
