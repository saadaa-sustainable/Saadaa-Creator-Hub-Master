import { describe, expect, it } from "vitest";
import { buildDailySnapshots } from "./eod-snapshot-data";
import type { MyPost } from "./types";

const row = (values: Partial<MyPost>): MyPost => ({
  id: 1,
  post_id: "SIF-1-P1",
  username: "creator",
  campaign_id: "IFC001",
  workflow_status: "On Board",
  reach_out_date: null,
  onboard_date: null,
  post_date: null,
  est_delivery: null,
  order_id: null,
  order_status: null,
  inf_name: "Creator",
  onboarded_by: null,
  ...values,
});

describe("buildDailySnapshots", () => {
  it("keeps stage ownership and deduplicates collab-level events", () => {
    const snapshots = buildDailySnapshots(
      [
        row({
          id: 1,
          collab_id: "SIF-1-C1",
          logged_by: "Tanvi",
          onboarded_by: "Krati",
          reach_out_date: "2026-07-24",
          onboard_date: "2026-07-24",
          est_delivery: "2026-07-24",
        }),
        row({
          id: 2,
          post_id: "SIF-1-P2",
          collab_id: "SIF-1-C1",
          logged_by: null,
          onboarded_by: "Krati",
          reach_out_date: "2026-07-24",
          onboard_date: "2026-07-24",
          est_delivery: "2026-07-24",
        }),
        row({
          id: 3,
          post_id: "SIF-2-P1",
          collab_id: "SIF-2-C1",
          onboarded_by: "Tanvi",
          posted_by: "Tanvi",
          post_date: "2026-07-24",
          est_delivery: "2026-07-24",
        }),
        row({
          id: 4,
          post_id: "SIF-3-P1",
          collab_id: "SIF-3-C1",
          logged_by: "Tanvi",
          reach_out_date: "2026-07-23",
        }),
        row({
          id: 5,
          post_id: "SIF-2-P2",
          collab_id: "SIF-2-C1",
          onboarded_by: "Tanvi",
          est_delivery: "2026-07-24",
        }),
        row({
          id: 6,
          post_id: "TEST-P1",
          posted_by: "Tanvi",
          post_date: "2026-07-24",
          is_test: true,
        }),
      ],
      "Tanvi",
      "2026-07-24",
    );

    expect(snapshots[0]).toMatchObject({
      date: "2026-07-24",
      reachouts: [{ collabId: "SIF-1-C1" }],
      onboarded: [],
      posted: [{ postId: "SIF-2-P1" }],
      edd: [{ postId: "SIF-2-P1" }, { postId: "SIF-2-P2" }],
    });
    expect(snapshots[1]).toMatchObject({
      date: "2026-07-23",
      reachouts: [{ collabId: "SIF-3-C1" }],
    });
    expect(
      buildDailySnapshots(
        [
          row({
            id: 1,
            collab_id: "SIF-1-C1",
            logged_by: "Tanvi",
            onboarded_by: "Krati",
            reach_out_date: "2026-07-24",
          }),
          row({
            id: 2,
            post_id: "SIF-1-P2",
            collab_id: "SIF-1-C1",
            logged_by: null,
            onboarded_by: "Krati",
            reach_out_date: "2026-07-24",
          }),
        ],
        "Krati",
        "2026-07-24",
      )[0].reachouts,
    ).toEqual([]);
  });
});
