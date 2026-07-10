import { describe, expect, it } from "vitest";
import {
  daysOverdue,
  isOffboardingCandidateRow,
  OffboardCreatorSchema,
  todayIsoInIndia,
} from "@/features/offboarding/rules";

describe("creator offboarding rules", () => {
  it("requires a meaningful reason", () => {
    expect(
      OffboardCreatorSchema.safeParse({ infId: "SIF-1", reason: "too short" })
        .success,
    ).toBe(false);
    expect(
      OffboardCreatorSchema.safeParse({
        infId: " SIF-1 ",
        reason: " Creator stopped responding after delivery. ",
      }).success,
    ).toBe(true);
  });

  it("rejects reasons over the audit limit", () => {
    expect(
      OffboardCreatorSchema.safeParse({
        infId: "SIF-1",
        reason: "x".repeat(1001),
      }).success,
    ).toBe(false);
  });

  it("uses the India calendar date", () => {
    expect(todayIsoInIndia(new Date("2026-07-09T20:00:00.000Z"))).toBe(
      "2026-07-10",
    );
  });

  it("accepts only overdue rows still waiting for posting", () => {
    const today = "2026-07-10";
    expect(
      isOffboardingCandidateRow(
        { workflow_status: "On Board", est_delivery: "2026-07-09" },
        today,
      ),
    ).toBe(true);
    expect(
      isOffboardingCandidateRow(
        { workflow_status: "Order Sent", est_delivery: "2026-07-01" },
        today,
      ),
    ).toBe(true);
    expect(
      isOffboardingCandidateRow(
        { workflow_status: "Posted", est_delivery: "2026-07-01" },
        today,
      ),
    ).toBe(false);
    expect(
      isOffboardingCandidateRow(
        { workflow_status: "On Board", est_delivery: today },
        today,
      ),
    ).toBe(false);
  });

  it("calculates overdue days without going negative", () => {
    expect(daysOverdue("2026-07-01", "2026-07-10")).toBe(9);
    expect(daysOverdue("2026-07-11", "2026-07-10")).toBe(0);
    expect(daysOverdue(null, "2026-07-10")).toBe(0);
  });
});
