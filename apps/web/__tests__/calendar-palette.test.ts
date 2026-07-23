import { describe, expect, it } from "vitest";
import { calendarEventPalette } from "@/features/calendar/palette";

describe("calendarEventPalette", () => {
  it("gives overdue delivery precedence over the normal EDD colour", () => {
    expect(calendarEventPalette({ type: "delivery", overdue: true }).tone).toBe(
      "overdue",
    );
    expect(calendarEventPalette({ type: "delivery" }).tone).toBe("delivery");
    expect(calendarEventPalette({ type: "posting" }).tone).toBe("posting");
  });
});
