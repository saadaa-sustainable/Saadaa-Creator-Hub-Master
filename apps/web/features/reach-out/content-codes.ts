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
  { code: "UGC", name: "UGC", description: "User-generated content" },
  { code: "VRP", name: "Verified Review Post" },
  { code: "OFF", name: "Off-Brand Collab" },
  { code: "BST", name: "Brand Storytelling" },
  { code: "EDU", name: "Educational", description: "Fabric / care education" },
  { code: "PRC", name: "Process / Behind-the-Scenes" },
  {
    code: "IFAD",
    name: "Influencer Ad",
    description: "Performance-creative tagged with IFAD",
  },
];

export function findContentCode(code: string): ContentCode | undefined {
  return CONTENT_CODES.find((c) => c.code === code);
}
