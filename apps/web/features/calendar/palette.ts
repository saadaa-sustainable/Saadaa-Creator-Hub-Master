import type { CalendarEventType } from "./queries";

export interface CalendarEventPalette {
  label: string;
  bg: string;
  fg: string;
  dot: string;
  border: string;
  tone: "delivery" | "posting" | "overdue";
}

const PALETTES: Record<CalendarEventPalette["tone"], CalendarEventPalette> = {
  delivery: {
    label: "Est. Delivery",
    bg: "#FAF1DC",
    fg: "#8C5A2B",
    dot: "#E8A020",
    border: "#E3BA70",
    tone: "delivery",
  },
  posting: {
    label: "Posted",
    bg: "#ECF1E9",
    fg: "#4F7C4D",
    dot: "#4F7C4D",
    border: "#BFD1BB",
    tone: "posting",
  },
  overdue: {
    label: "Overdue Delivery",
    bg: "#FDECEA",
    fg: "#C0392B",
    dot: "#C0392B",
    border: "#E5A49D",
    tone: "overdue",
  },
};

export function calendarEventPalette(event: {
  type: CalendarEventType;
  overdue?: boolean;
}): CalendarEventPalette {
  return event.overdue ? PALETTES.overdue : PALETTES[event.type];
}

export const CALENDAR_LEGEND = [
  PALETTES.delivery,
  PALETTES.posting,
  PALETTES.overdue,
] as const;
