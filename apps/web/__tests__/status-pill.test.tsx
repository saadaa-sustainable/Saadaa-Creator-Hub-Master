import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  StatusPill,
  WorkflowStatusPill,
  PaymentStatusPill,
  AdResultPill,
} from "@/components/ui/status-pill";

describe("StatusPill", () => {
  it("renders children", () => {
    render(<StatusPill tone="success">Done</StatusPill>);
    expect(screen.getByText("Done")).toBeInTheDocument();
  });

  it("maps workflow statuses to tones", () => {
    render(<WorkflowStatusPill status="Posted" />);
    const el = screen.getByText("Posted");
    expect(el).toBeInTheDocument();
    // Posted → success tone → bg-success-bg class
    expect(el.className).toContain("bg-success-bg");
  });

  it("maps payment statuses", () => {
    render(<PaymentStatusPill status="Due" />);
    const el = screen.getByText("Due");
    expect(el.className).toContain("bg-warning-bg");
  });

  it("renders dash for null ad result", () => {
    render(<AdResultPill result={null} />);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("uses success tone for Winner", () => {
    render(<AdResultPill result="Winner" />);
    expect(screen.getByText("Winner").className).toContain("bg-success-bg");
  });
});
