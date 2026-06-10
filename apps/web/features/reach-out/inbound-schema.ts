import { z } from "zod";
import { GENDERS } from "./schema";
import { IG_PROFILE_RE } from "@/lib/validators";

/**
 * Inbound batch — mirrors legacy submitReachOutBatch + #view-reachout-inbound.
 * Bulk roster, manual cap 10, CSV bypass, batch submit creates one Reach Out
 * (workflow_status='Reach Out', reachout_direction='inbound') per valid row.
 *
 * Mandatory per row: url, gender, contentCode. Collab Type + Commercials were
 * removed from the inbound flow (2026-06-10) — inbound reach-outs are always
 * Barter with ₹0 compensation. The fields remain in the row type (defaulted to
 * Barter / 0) so submit_reachout still receives a collab_type, but they are no
 * longer collected in the UI or the template.
 */

export const INBOUND_COLLAB_TYPES = ["Barter", "Barter + Paid"] as const;
export type InboundCollabType = (typeof INBOUND_COLLAB_TYPES)[number];

export const InboundRowSchema = z.object({
  instagramLink: z
    .string()
    .trim()
    .min(1, "Profile URL required")
    .regex(IG_PROFILE_RE, "Must be a valid Instagram profile URL"),
  gender: z.enum(GENDERS, { message: "Gender required" }),
  contentCode: z.string().trim().min(1, "Content Type required"),
  // Inbound is always Barter / ₹0 — defaulted, not collected in the UI.
  collabType: z.enum(INBOUND_COLLAB_TYPES).default("Barter"),
  commercials: z.coerce.number().min(0).default(0),
});
export type InboundRowInput = z.infer<typeof InboundRowSchema>;

export const InboundBatchSchema = z.object({
  campaignId: z.string().trim().min(1, "Campaign required"),
  rows: z.array(InboundRowSchema).min(1, "Add at least one row"),
});
export type InboundBatchInput = z.infer<typeof InboundBatchSchema>;

export const INBOUND_MANUAL_CAP = 10;

export function makeInboundRow(
  prefill: Partial<InboundRowInput> = {},
): InboundRowInput {
  return {
    instagramLink: prefill.instagramLink ?? "",
    gender: prefill.gender ?? "Female",
    contentCode: prefill.contentCode ?? "",
    collabType: prefill.collabType ?? "Barter",
    commercials:
      prefill.commercials != null && !Number.isNaN(prefill.commercials)
        ? prefill.commercials
        : 0,
  };
}

/** Legacy Barter rule: commercials forced to 0 for Barter (parity with onboarding). */
export function applyInboundBarterLock(row: InboundRowInput): InboundRowInput {
  if (row.collabType === "Barter") return { ...row, commercials: 0 };
  return row;
}

/** username slug derived from URL (mirrors legacy _usernameFromUrlInbound). */
export function inboundUsernameFromUrl(input: string): string {
  return input
    .trim()
    .replace(/^.*instagram\.com\//i, "")
    .replace(/[\/\?#].*$/, "")
    .replace(/^@/, "")
    .toLowerCase();
}
