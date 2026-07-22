import { describe, expect, it } from "vitest";
import { reachoutConflict } from "@/features/reach-out/eligibility";

describe("reachoutConflict", () => {
  it("allows correcting the current assignment but still blocks other active rows", () => {
    const rows = [
      { id: 1, campaign_id: "IFC001", reach_out_date: "2026-07-20", workflow_status: "Reach Out" },
      { id: 2, campaign_id: "IFC002", reach_out_date: "2026-07-19", workflow_status: "Reach Out" },
    ];

    expect(reachoutConflict(rows, "IFC003", "2026-06-22", [1, 2])).toBeNull();
    expect(reachoutConflict(rows, "IFC002", "2026-06-22", [1])).toBe("same-campaign");
    expect(reachoutConflict(rows, "IFC003", "2026-06-22", [1])).toBe("cooldown");
  });
});
