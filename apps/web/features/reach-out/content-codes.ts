/**
 * Content type nomenclature — mirrors the legacy `Content Type Nomenclature`
 * Sheet tab + `getContentTypeNomenclature` backend fn.
 *
 * TODO(phase-2): pull these from a Supabase `content_type_codes` table so the
 * team can manage them without a redeploy. For now they're hard-coded as v1.
 */

export interface ContentCode {
  code: string;
  name: string;
  description?: string;
}

export const CONTENT_CODES: ContentCode[] = [
  { code: "UGC", name: "User Generated Content" },
  { code: "VRP", name: "Visual Representation" },
  { code: "OFF", name: "Offers & Pricing" },
  { code: "BST", name: "Brand Story" },
  { code: "EDU", name: "Educational" },
  { code: "PRC", name: "PR & Media Coverage" },
  { code: "TBG", name: "Team Branding" },
  { code: "MAR", name: "Marketplaces" },
  { code: "OST", name: "Offline Store" },
  { code: "FOU", name: "Founder's video" },
];

export function findContentCode(code: string): ContentCode | undefined {
  return CONTENT_CODES.find((c) => c.code === code);
}
