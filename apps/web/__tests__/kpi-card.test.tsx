import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { KpiCard, KpiStrip } from "@/components/ui/kpi-card";

describe("KpiCard", () => {
  it("renders label, value, sub", () => {
    render(<KpiCard label="Creators" value={42} sub="active" />);
    expect(screen.getByText("Creators")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("shows skeleton when loading", () => {
    render(<KpiCard label="Spend" value="-" loading />);
    expect(screen.getByLabelText("Spend")).toHaveAttribute("role", "figure");
  });

  it("applies success tone", () => {
    const { container } = render(
      <KpiCard label="Posted" value={10} tone="success" />,
    );
    const numeral = container.querySelector(".text-success");
    expect(numeral).not.toBeNull();
  });
});

describe("KpiStrip", () => {
  it("groups KPIs with a labeled role", () => {
    render(
      <KpiStrip>
        <KpiCard label="A" value={1} />
        <KpiCard label="B" value={2} />
      </KpiStrip>,
    );
    expect(
      screen.getByRole("group", { name: /key performance/i }),
    ).toBeInTheDocument();
  });
});
