import { describe, expect, it } from "vitest";
import {
  creatorAcceptedPartnership,
  isCollabPaymentEligible,
  isPaymentPendingStatus,
  postingFormCompleted,
} from "@/lib/payment-eligibility";

describe("payment eligibility", () => {
  const ready = {
    post_link: "https://instagram.com/p/example",
    post_date: "2026-07-10",
    partnership_status: "approved",
  };

  it("requires both posting-form fields", () => {
    expect(postingFormCompleted(ready)).toBe(true);
    expect(postingFormCompleted({ ...ready, post_link: null })).toBe(false);
    expect(postingFormCompleted({ ...ready, post_date: null })).toBe(false);
  });

  it("accepts approved status or a recorded approval timestamp", () => {
    expect(creatorAcceptedPartnership(ready)).toBe(true);
    // A recorded approval timestamp counts even when the status has gone blank.
    expect(
      creatorAcceptedPartnership({
        post_link: ready.post_link,
        post_date: ready.post_date,
        partnership_status: null,
        partnership_approved_at: "2026-07-09T10:00:00Z",
      }),
    ).toBe(true);
    // Pending never counts — the "Pending Approval" ordering trap.
    expect(
      creatorAcceptedPartnership({
        ...ready,
        partnership_status: "Pending Approval",
      }),
    ).toBe(false);
    expect(
      creatorAcceptedPartnership({ ...ready, partnership_status: "rejected" }),
    ).toBe(false);
    // A since-revoked creator does NOT count, even with a stale approval stamp.
    expect(
      creatorAcceptedPartnership({
        ...ready,
        partnership_status: "Revoked",
        partnership_approved_at: "2026-07-09T10:00:00Z",
      }),
    ).toBe(false);
  });

  it("requires every deliverable in the collab to pass both gates", () => {
    expect(isCollabPaymentEligible([ready, ready])).toBe(true);
    expect(
      isCollabPaymentEligible([ready, { ...ready, post_link: null }]),
    ).toBe(false);
    expect(
      isCollabPaymentEligible([
        ready,
        { ...ready, partnership_status: "pending" },
      ]),
    ).toBe(false);
    expect(isCollabPaymentEligible([])).toBe(false);
  });

  it("counts only open ledger states as payment pending", () => {
    expect(isPaymentPendingStatus("Not Due")).toBe(true);
    expect(isPaymentPendingStatus("Due")).toBe(true);
    expect(isPaymentPendingStatus("Partial")).toBe(true);
    expect(isPaymentPendingStatus("Done")).toBe(false);
    expect(isPaymentPendingStatus(null)).toBe(false);
  });
});
