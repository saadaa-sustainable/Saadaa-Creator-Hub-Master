"use client";

import { useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Download,
  Send,
  TriangleAlert,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/formatters";
import type { DailySnapshot, DailySnapshotItem } from "./eod-snapshot-data";

const METRICS = [
  {
    key: "reachouts",
    label: "Reach-outs",
    note: "Creators contacted",
    color: "#3B6FD4",
    icon: Send,
  },
  {
    key: "onboarded",
    label: "Onboarded",
    note: "Collabs completed",
    color: "#7B4FBF",
    icon: UserCheck,
  },
  {
    key: "posted",
    label: "Posted",
    note: "Deliverables posted",
    color: "#4F7C4D",
    icon: CheckCircle2,
  },
  {
    key: "edd",
    label: "EDD due",
    note: "Deliverables promised",
    color: "#B57514",
    icon: CalendarClock,
  },
  {
    key: "overdue",
    label: "Overdue till now",
    note: "Past promised deliverables",
    color: "#C0392B",
    icon: TriangleAlert,
  },
] as const;

type Metric = (typeof METRICS)[number];
type MetricKey = Metric["key"];

interface ActivityRow {
  key: string;
  metric: Metric;
  item: DailySnapshotItem;
}

function activityRows(snapshot: DailySnapshot): ActivityRow[] {
  return METRICS.flatMap((metric) =>
    snapshot[metric.key].map((item) => ({
      key: `${metric.key}-${item.id}`,
      metric,
      item,
    })),
  );
}

function stageReference(key: MetricKey, item: DailySnapshotItem): string {
  if (key === "reachouts") return item.infId ?? item.postId ?? "—";
  if (key === "onboarded") return item.collabId ?? item.infId ?? "—";
  return item.postId ?? item.collabId ?? item.infId ?? "—";
}

function activityDate(
  key: MetricKey,
  item: DailySnapshotItem,
  snapshotDate: string,
): string {
  return key === "overdue" && item.estDelivery
    ? item.estDelivery
    : snapshotDate;
}

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill: string,
  stroke?: string,
) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
  if (stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = 2;
    context.stroke();
  }
}

function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (context.measureText(text).width <= maxWidth) return text;
  let value = text;
  while (
    value.length > 1 &&
    context.measureText(`${value}…`).width > maxWidth
  ) {
    value = value.slice(0, -1);
  }
  return `${value}…`;
}

function renderSnapshotCanvas(
  snapshot: DailySnapshot,
  memberLabel: string,
  rows: ActivityRow[],
  totalRows: number,
  page: number,
  pageCount: number,
): HTMLCanvasElement {
  const rowHeight = 58;
  const tableTop = 430;
  const tableHeaderHeight = 52;
  const footerHeight = 72;
  const canvas = document.createElement("canvas");
  canvas.width = 1720;
  canvas.height =
    tableTop +
    tableHeaderHeight +
    Math.max(rows.length, 1) * rowHeight +
    footerHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image export is unavailable");

  context.fillStyle = "#FAF8F5";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#161513";
  context.font = "700 52px Inter, Arial, sans-serif";
  context.fillText("EOD WORK SNAPSHOT", 70, 92);
  context.fillStyle = "#6E695E";
  context.font = "500 28px Inter, Arial, sans-serif";
  context.fillText(`${memberLabel} · ${formatDate(snapshot.date)}`, 70, 140);

  drawRoundedRect(context, 1345, 55, 305, 92, 22, "#F0EAD6");
  context.fillStyle = "#161513";
  context.font = "700 34px Inter, Arial, sans-serif";
  context.fillText(String(totalRows), 1382, 110);
  context.fillStyle = "#6E695E";
  context.font = "600 17px Inter, Arial, sans-serif";
  context.fillText("ACTIVITY ROWS", 1450, 109);

  METRICS.forEach((metric, index) => {
    const items = snapshot[metric.key];
    const gap = 16;
    const width = (1580 - gap * (METRICS.length - 1)) / METRICS.length;
    const x = 70 + index * (width + gap);
    const y = 190;
    drawRoundedRect(context, x, y, width, 156, 22, "#FFFFFF", "#E7E2D2");
    context.fillStyle = metric.color;
    context.fillRect(x, y, 7, 156);
    context.fillStyle = "#161513";
    context.font = "700 52px Inter, Arial, sans-serif";
    context.fillText(String(items.length), x + 34, y + 70);
    context.font = "700 23px Inter, Arial, sans-serif";
    context.fillText(metric.label, x + 34, y + 108);
    context.fillStyle = "#9A9384";
    context.font = "500 17px Inter, Arial, sans-serif";
    context.fillText(metric.note, x + 34, y + 135);
  });

  context.fillStyle = "#161513";
  context.font = "700 25px Inter, Arial, sans-serif";
  context.fillText("Activity detail", 70, 402);
  context.fillStyle = "#6E695E";
  context.font = "500 17px Inter, Arial, sans-serif";
  context.fillText(
    pageCount > 1
      ? `Every creator entry · Page ${page} of ${pageCount}`
      : "Every creator entry for the selected day",
    252,
    402,
  );

  const columns = [
    { label: "Stage", x: 70, width: 180 },
    { label: "Creator", x: 250, width: 430 },
    { label: "SIF ID", x: 680, width: 180 },
    { label: "Stage reference", x: 860, width: 250 },
    { label: "Campaign", x: 1110, width: 170 },
    { label: "Content", x: 1280, width: 190 },
    { label: "Date", x: 1470, width: 180 },
  ];
  drawRoundedRect(
    context,
    70,
    tableTop,
    1580,
    tableHeaderHeight,
    14,
    "#2C2420",
  );
  context.fillStyle = "#FFFCF8";
  context.font = "700 15px Inter, Arial, sans-serif";
  columns.forEach((column) =>
    context.fillText(column.label.toUpperCase(), column.x + 14, tableTop + 33),
  );

  if (rows.length === 0) {
    drawRoundedRect(
      context,
      70,
      tableTop + tableHeaderHeight,
      1580,
      rowHeight,
      0,
      "#FFFFFF",
      "#E7E2D2",
    );
    context.fillStyle = "#9A9384";
    context.font = "500 18px Inter, Arial, sans-serif";
    context.fillText("No activity recorded", 84, tableTop + 89);
  } else {
    rows.forEach(({ metric, item }, index) => {
      const y = tableTop + tableHeaderHeight + index * rowHeight;
      context.fillStyle = index % 2 === 0 ? "#FFFFFF" : "#F8F5F0";
      context.fillRect(70, y, 1580, rowHeight);
      context.strokeStyle = "#E7E2D2";
      context.beginPath();
      context.moveTo(70, y + rowHeight);
      context.lineTo(1650, y + rowHeight);
      context.stroke();

      drawRoundedRect(context, 84, y + 14, 138, 30, 15, `${metric.color}18`);
      context.fillStyle = metric.color;
      context.font = "700 14px Inter, Arial, sans-serif";
      context.fillText(metric.label, 99, y + 34);

      context.fillStyle = "#161513";
      context.font = "600 17px Inter, Arial, sans-serif";
      context.fillText(fitText(context, item.creatorName, 390), 264, y + 25);
      context.fillStyle = "#6E695E";
      context.font = "500 14px Inter, Arial, sans-serif";
      context.fillText(
        fitText(context, item.username ? `@${item.username}` : "—", 390),
        264,
        y + 46,
      );

      context.fillStyle = "#161513";
      context.font = "600 16px Inter, Arial, sans-serif";
      context.fillText(item.infId ?? "—", 694, y + 35);
      context.fillText(
        fitText(context, stageReference(metric.key, item), 220),
        874,
        y + 35,
      );
      context.fillText(item.campaignId ?? "—", 1124, y + 35);
      context.fillText(
        fitText(context, item.contentType ?? "—", 160),
        1294,
        y + 35,
      );
      context.fillText(
        formatDate(activityDate(metric.key, item, snapshot.date)),
        1484,
        y + 35,
      );
    });
  }

  context.fillStyle = "#9A9384";
  context.font = "500 17px Inter, Arial, sans-serif";
  context.fillText(
    "CreatorHub · Generated from live team entries",
    70,
    canvas.height - 28,
  );

  return canvas;
}

async function downloadSnapshotPng(
  snapshot: DailySnapshot,
  memberLabel: string,
): Promise<number> {
  const allRows = activityRows(snapshot);
  const pageSize = 120;
  const pages: ActivityRow[][] =
    allRows.length === 0
      ? [[]]
      : Array.from(
          { length: Math.ceil(allRows.length / pageSize) },
          (_, index) => allRows.slice(index * pageSize, (index + 1) * pageSize),
        );

  for (const [index, rows] of pages.entries()) {
    const canvas = renderSnapshotCanvas(
      snapshot,
      memberLabel,
      rows,
      allRows.length,
      index + 1,
      pages.length,
    );
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("Could not create PNG")),
        "image/png",
      );
    });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download =
      pages.length === 1
        ? `creatorhub-eod-${snapshot.date}.png`
        : `creatorhub-eod-${snapshot.date}-${index + 1}-of-${pages.length}.png`;
    link.click();
    URL.revokeObjectURL(href);
  }

  return pages.length;
}

export function EodSnapshot({
  snapshots,
  memberLabel,
}: {
  snapshots: DailySnapshot[];
  memberLabel: string;
}) {
  const [selectedDate, setSelectedDate] = useState(snapshots[0]?.date ?? "");
  const [downloading, setDownloading] = useState(false);
  const snapshot =
    snapshots.find((item) => item.date === selectedDate) ?? snapshots[0];

  if (!snapshot) return null;
  const rows = activityRows(snapshot);

  const download = async () => {
    setDownloading(true);
    try {
      const pageCount = await downloadSnapshotPng(snapshot, memberLabel);
      toast.success(
        pageCount === 1
          ? `${formatDate(snapshot.date)} snapshot downloaded`
          : `${pageCount} snapshot pages downloaded`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not download snapshot",
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section
      className="bento-tile overflow-hidden rounded-2xl border border-border bg-bg-white"
      aria-labelledby="eod-snapshot-heading"
    >
      <header className="flex flex-col gap-3 border-b border-border bg-bg-surface/50 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
        <div>
          <p className="mb-1 text-[0.6rem] font-extrabold uppercase tracking-[0.1em] text-text-tertiary">
            Share-ready report
          </p>
          <h2
            id="eod-snapshot-heading"
            className="text-[0.95rem] font-bold text-text-primary"
          >
            EOD Snapshot
          </h2>
          <p className="text-[0.7rem] text-text-secondary">
            {formatDate(snapshot.date)} · stage entries attributed to{" "}
            {memberLabel}
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div
            className="flex shrink-0 rounded-xl border border-border bg-bg-white p-1"
            aria-label="Snapshot day"
          >
            {snapshots.map((item, index) => (
              <button
                key={item.date}
                type="button"
                aria-pressed={selectedDate === item.date}
                className={`min-h-8 rounded-lg px-3 text-[0.7rem] font-semibold transition-colors ${
                  selectedDate === item.date
                    ? "bg-text-primary text-bg-white"
                    : "text-text-secondary hover:bg-bg-surface"
                }`}
                onClick={() => setSelectedDate(item.date)}
              >
                {index === 0 ? "Today" : "Yesterday"}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn-primary-cta min-h-10 flex-1 whitespace-nowrap px-4 py-2 text-xs sm:flex-none"
            disabled={downloading}
            onClick={download}
          >
            <Download size={15} aria-hidden />
            {downloading ? "Creating PNG…" : "Download PNG"}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-3 lg:grid-cols-5">
        {METRICS.map((metric) => {
          const items = snapshot[metric.key];
          const Icon = metric.icon;
          return (
            <article
              key={metric.key}
              className="min-w-0 bg-bg-white p-3 sm:p-4"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.07em] text-text-secondary">
                    {metric.label}
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-text-primary">
                    {items.length}
                  </p>
                </div>
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-xl"
                  style={{
                    color: metric.color,
                    backgroundColor: `color-mix(in srgb, ${metric.color} 11%, white)`,
                  }}
                >
                  <Icon size={15} aria-hidden />
                </span>
              </div>
              <p className="text-[0.68rem] text-text-tertiary">{metric.note}</p>
            </article>
          );
        })}
      </div>

      <details className="group border-t border-border bg-bg-white">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-bg-surface/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent [&::-webkit-details-marker]:hidden sm:px-4">
          <div>
            <p className="text-xs font-bold text-text-primary">
              Activity details
            </p>
            <p className="mt-0.5 text-[0.68rem] text-text-secondary">
              View every creator entry for the selected day
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-bg-surface px-2.5 py-1 text-[0.68rem] font-semibold tabular-nums text-text-secondary">
              {rows.length} rows
            </span>
            <ChevronDown
              size={17}
              className="text-text-tertiary transition-transform duration-200 group-open:rotate-180"
              aria-hidden
            />
          </div>
        </summary>
        <div className="border-t border-border p-3 sm:p-4">
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="min-w-[900px] w-full text-[0.72rem]">
              <thead>
                <tr className="border-b border-border bg-text-primary text-left text-[0.6rem] uppercase tracking-[0.06em] text-bg-white">
                  <th className="px-3 py-2.5 font-bold">Stage</th>
                  <th className="px-3 py-2.5 font-bold">Creator</th>
                  <th className="px-3 py-2.5 font-bold">SIF ID</th>
                  <th className="px-3 py-2.5 font-bold">Stage reference</th>
                  <th className="px-3 py-2.5 font-bold">Campaign</th>
                  <th className="px-3 py-2.5 font-bold">Content</th>
                  <th className="px-3 py-2.5 font-bold">Date</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-8 text-center text-text-tertiary"
                    >
                      No activity recorded
                    </td>
                  </tr>
                ) : (
                  rows.map(({ key, metric, item }) => (
                    <tr
                      key={key}
                      className="border-b border-border last:border-0 odd:bg-bg-white even:bg-bg-surface/45"
                    >
                      <td className="px-3 py-2.5">
                        <span
                          className="inline-flex rounded-full px-2 py-1 text-[0.62rem] font-bold"
                          style={{
                            color: metric.color,
                            backgroundColor: `color-mix(in srgb, ${metric.color} 11%, white)`,
                          }}
                        >
                          {metric.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="max-w-[260px] break-words font-semibold text-text-primary">
                          {item.creatorName}
                        </p>
                        <p className="max-w-[260px] break-all text-[0.65rem] text-text-tertiary">
                          {item.username ? `@${item.username}` : "—"}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-text-primary">
                        {item.infId ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-text-primary">
                        {stageReference(metric.key, item)}
                      </td>
                      <td className="px-3 py-2.5 text-text-secondary">
                        {item.campaignId ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-text-secondary">
                        {item.contentType ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-text-secondary">
                        {formatDate(
                          activityDate(metric.key, item, snapshot.date),
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </section>
  );
}
