import { describe, expect, it } from "vitest";
import { summarizeCollabEmailRows } from "./collab-email-data";

describe("summarizeCollabEmailRows", () => {
  it("aggregates the collab while preserving its Shopify product quantity", () => {
    expect(
      summarizeCollabEmailRows([
        {
          reels: 1,
          static_posts: 0,
          stories: 1,
          commercial_amount: 1500,
          garment_qty: "3",
        },
        {
          reels: 0,
          static_posts: 1,
          stories: 0,
          commercial_amount: 1500,
          garment_qty: "3",
        },
      ]),
    ).toEqual({
      reels: 1,
      staticPosts: 1,
      stories: 1,
      commercialAmount: 3000,
      productQuantity: "3",
    });
  });
});
