import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const TERMS_ATTACHMENT = {
  fileName: "Saadaa_Influencer_TC.pdf",
  mimeType: "application/pdf",
  path: join(process.cwd(), "../../..", "Saadaa_Influencer_TC.pdf"),
  url: "/api/assets/saadaa-influencer-tc",
} as const;

export async function readTermsAttachmentFile(): Promise<{
  fileName: string;
  mimeType: string;
  base64: string;
} | null> {
  try {
    const buffer = await readFile(TERMS_ATTACHMENT.path);
    return {
      fileName: TERMS_ATTACHMENT.fileName,
      mimeType: TERMS_ATTACHMENT.mimeType,
      base64: buffer.toString("base64"),
    };
  } catch {
    return null;
  }
}

export async function readTermsAttachmentBuffer(): Promise<Buffer> {
  return readFile(TERMS_ATTACHMENT.path);
}
