import { describe, expect, it } from "vitest";
import { REACHOUT_DEFAULTS, ReachOutSchema } from "@/features/reach-out/schema";

describe("ReachOutSchema", () => {
  const valid = {
    ...REACHOUT_DEFAULTS,
    campaignId: "IFC012",
    instagramLink: "https://www.instagram.com/saadaadesigns",
    influencerName: "Saadaa Designs",
    followers: 12500,
    gender: "Female" as const,
    verification: "Verified" as const,
    contentType: "UGC",
    language: "English" as const,
  };

  it("accepts a valid reach-out", () => {
    const r = ReachOutSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("rejects bad Instagram URL", () => {
    const r = ReachOutSchema.safeParse({
      ...valid,
      instagramLink: "not-a-url",
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty campaign", () => {
    const r = ReachOutSchema.safeParse({ ...valid, campaignId: "" });
    expect(r.success).toBe(false);
  });

  it("rejects empty content type", () => {
    const r = ReachOutSchema.safeParse({ ...valid, contentType: "" });
    expect(r.success).toBe(false);
  });

  it("accepts when followers + er + avgLikes are absent (Pending profile)", () => {
    const r = ReachOutSchema.safeParse({
      ...valid,
      followers: undefined,
      er: undefined,
      avgLikes: undefined,
      verification: "Pending",
    });
    expect(r.success).toBe(true);
  });

  it("rejects unknown language", () => {
    const r = ReachOutSchema.safeParse({ ...valid, language: "Klingon" });
    expect(r.success).toBe(false);
  });
});
