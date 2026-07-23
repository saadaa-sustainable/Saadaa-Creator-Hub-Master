import { describe, expect, it } from "vitest";
import { shouldReloadForStaleServerAction } from "@/components/ui/app-error-state";

describe("stale Server Action recovery", () => {
  const message =
    'Server Action "old-action-id" was not found on the server.';

  it("reloads once and waits before trying again", () => {
    expect(shouldReloadForStaleServerAction(message, null, 100_000)).toBe(true);
    expect(shouldReloadForStaleServerAction(message, 90_000, 100_000)).toBe(
      false,
    );
    expect(shouldReloadForStaleServerAction(message, 30_000, 100_000)).toBe(
      true,
    );
    expect(
      shouldReloadForStaleServerAction("Database unavailable", null, 100_000),
    ).toBe(false);
  });
});
