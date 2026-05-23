import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatFollowers,
  formatRupees,
  pct,
  proxyAvatarUrl,
  tierFromFollowers,
} from "@/lib/formatters";

describe("formatRupees", () => {
  it("formats Indian rupees with grouping", () => {
    expect(formatRupees(123456)).toMatch(/₹.*1,23,456/);
  });
  it("returns dash for null", () => {
    expect(formatRupees(null)).toBe("—");
  });
});

describe("formatFollowers", () => {
  it("formats Ks and Ms", () => {
    expect(formatFollowers(800)).toBe("800");
    expect(formatFollowers(12_500)).toBe("12.5K");
    expect(formatFollowers(1_200_000)).toBe("1.2M");
  });
});

describe("tierFromFollowers", () => {
  it("matches generated category boundaries", () => {
    expect(tierFromFollowers(5000)).toBe("Nano");
    expect(tierFromFollowers(20_000)).toBe("Micro");
    expect(tierFromFollowers(200_000)).toBe("Mid tier");
    expect(tierFromFollowers(700_000)).toBe("Macro");
    expect(tierFromFollowers(2_000_000)).toBe("Mega");
    expect(tierFromFollowers(null)).toBeNull();
  });
});

describe("formatDate", () => {
  it("formats in IST", () => {
    expect(formatDate("2026-05-19T00:00:00Z")).toMatch(/May 2026/);
  });
  it("handles bad input", () => {
    expect(formatDate("not-a-date")).toBe("—");
  });
});

describe("pct", () => {
  it("formats percentages", () => {
    expect(pct(12.345)).toBe("12.3%");
    expect(pct(null)).toBe("—");
  });
});

describe("proxyAvatarUrl", () => {
  it("wraps via weserv", () => {
    const out = proxyAvatarUrl("https://cdn.example.com/a.jpg", 80);
    expect(out).toContain("images.weserv.nl");
    expect(out).toContain("w=80");
  });
  it("returns null for null", () => {
    expect(proxyAvatarUrl(null)).toBeNull();
  });
});
