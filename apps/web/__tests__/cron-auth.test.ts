import { describe, expect, it } from "vitest";
import { isCronAuthorized } from "@/lib/cron-auth";

const request = (authorization?: string, vercelCron = false) => ({
  headers: new Headers({
    ...(authorization ? { authorization } : {}),
    ...(vercelCron ? { "x-vercel-cron": "1" } : {}),
  }),
});

describe("notification cron authentication", () => {
  it("fails closed and only accepts the configured bearer secret", () => {
    expect(isCronAuthorized(request(undefined, true), undefined)).toBe(false);
    expect(isCronAuthorized(request("Bearer wrong"), "right")).toBe(false);
    expect(isCronAuthorized(request("Bearer right"), "right")).toBe(true);
  });
});
