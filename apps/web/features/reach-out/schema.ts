import { z } from "zod";

/**
 * Reach-Out outbound submission schema — mirrors legacy form fields ONLY.
 * Onboarding-stage fields (state, email, deliverable counts, collab type,
 * ads usage rights, reach-out channel) are NOT in the reach-out form — they
 * are captured in Onboarding / Order Creation.
 */

export const LANGUAGES = [
  "English",
  "Hindi",
  "Bengali",
  "Marathi",
  "Telugu",
  "Tamil",
  "Gujarati",
  "Kannada",
  "Malayalam",
  "Punjabi",
  "Odia",
  "Assamese",
  "Maithili",
  "Urdu",
  "Rajasthani",
  "Haryanvi",
  "Bhojpuri",
  "English + Hindi",
  "Hindi + Regional",
  "Multilingual",
] as const;
export type Language = (typeof LANGUAGES)[number];

export const GENDERS = ["Male", "Female", "Others"] as const;
export type Gender = (typeof GENDERS)[number];

export const VERIFICATIONS = ["Verified", "Non-Verified", "Pending"] as const;
export type Verification = (typeof VERIFICATIONS)[number];

const igUrlRe = /^https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9._]+/i;

export const REACHOUT_DIRECTIONS = ["outbound", "inbound"] as const;
export type ReachoutDirection = (typeof REACHOUT_DIRECTIONS)[number];

export const ReachOutSchema = z.object({
  // ----- Direction (inbound vs outbound) -------------------------------
  reachoutDirection: z.enum(REACHOUT_DIRECTIONS).default("outbound"),

  // ----- Campaign --------------------------------------------------------
  campaignId: z.string().trim().min(1, "Campaign required"),

  // ----- Influencer profile ---------------------------------------------
  instagramLink: z
    .string()
    .trim()
    .min(1, "Instagram URL required")
    .regex(igUrlRe, "Must be a valid Instagram profile URL"),
  influencerName: z.string().trim().min(1, "Full name required"),
  followers: z.coerce.number().int().nonnegative().optional(),

  // ----- Content + metrics ----------------------------------------------
  gender: z.enum(GENDERS),
  verification: z.enum(VERIFICATIONS),
  contentType: z.string().trim().min(1, "Content type required"),
  contentName: z.string().trim().optional().default(""),
  language: z.enum(LANGUAGES),
  er: z.coerce.number().nonnegative().optional(),
  avgLikes: z.coerce.number().nonnegative().optional(),

  // ----- Commercials (optional) -----------------------------------------
  commercialReelRate: z.coerce.number().nonnegative().optional(),
  commercialPostRate: z.coerce.number().nonnegative().optional(),
  commercialStoryRate: z.coerce.number().nonnegative().optional(),
});

export type ReachOutInput = z.infer<typeof ReachOutSchema>;

export const REACHOUT_DEFAULTS: ReachOutInput = {
  reachoutDirection: "outbound",
  campaignId: "",
  instagramLink: "",
  influencerName: "",
  followers: undefined,
  gender: "Female",
  verification: "Pending",
  contentType: "",
  contentName: "",
  language: "English",
  er: undefined,
  avgLikes: undefined,
  commercialReelRate: undefined,
  commercialPostRate: undefined,
  commercialStoryRate: undefined,
};
