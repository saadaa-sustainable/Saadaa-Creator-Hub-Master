"use client";

import { useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Download,
  Send,
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
] as const;

function itemLabel(item: DailySnapshotItem): string {
  return `${item.creatorName}${item.campaignId ? ` · ${item.campaignId}` : ""}`;
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

function clipped(text: string, max = 38): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

async function downloadSnapshotPng(
  snapshot: DailySnapshot,
  memberLabel: string,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 900;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image export is unavailable");

  context.fillStyle = "#FAF8F5";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#161513";
  context.font = "700 54px Inter, Arial, sans-serif";
  context.fillText("EOD WORK SNAPSHOT", 80, 100);
  context.fillStyle = "#6E695E";
  context.font = "500 28px Inter, Arial, sans-serif";
  context.fillText(`${memberLabel} · ${formatDate(snapshot.date)}`, 80, 148);

  const total =
    snapshot.reachouts.length +
    snapshot.onboarded.length +
    snapshot.posted.length;
  drawRoundedRect(context, 1240, 64, 280, 90, 22, "#F0EAD6");
  context.fillStyle = "#161513";
  context.font = "700 34px Inter, Arial, sans-serif";
  context.fillText(String(total), 1280, 112);
  context.fillStyle = "#6E695E";
  context.font = "600 17px Inter, Arial, sans-serif";
  context.fillText("STAGE UPDATES", 1345, 111);

  METRICS.forEach((metric, index) => {
    const items = snapshot[metric.key];
    const x = 80 + index * 380;
    const y = 220;
    drawRoundedRect(context, x, y, 340, 590, 28, "#FFFFFF", "#E7E2D2");
    context.fillStyle = metric.color;
    context.fillRect(x, y, 8, 590);
    context.fillStyle = "#161513";
    context.font = "700 64px Inter, Arial, sans-serif";
    context.fillText(String(items.length), x + 36, y + 100);
    context.font = "700 25px Inter, Arial, sans-serif";
    context.fillText(metric.label, x + 36, y + 146);
    context.fillStyle = "#9A9384";
    context.font = "500 18px Inter, Arial, sans-serif";
    context.fillText(metric.note, x + 36, y + 178);

    context.strokeStyle = "#E7E2D2";
    context.beginPath();
    context.moveTo(x + 36, y + 210);
    context.lineTo(x + 304, y + 210);
    context.stroke();

    if (items.length === 0) {
      context.fillStyle = "#9A9384";
      context.font = "500 19px Inter, Arial, sans-serif";
      context.fillText("No entries", x + 36, y + 260);
      return;
    }

    items.slice(0, 7).forEach((item, itemIndex) => {
      const itemY = y + 258 + itemIndex * 43;
      context.fillStyle = metric.color;
      context.beginPath();
      context.arc(x + 42, itemY - 6, 5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#161513";
      context.font = "600 18px Inter, Arial, sans-serif";
      context.fillText(clipped(itemLabel(item)), x + 58, itemY);
    });
    if (items.length > 7) {
      context.fillStyle = "#6E695E";
      context.font = "600 17px Inter, Arial, sans-serif";
      context.fillText(`+${items.length - 7} more`, x + 36, y + 575);
    }
  });

  context.fillStyle = "#9A9384";
  context.font = "500 17px Inter, Arial, sans-serif";
  context.fillText("CreatorHub · Generated from live team entries", 80, 864);

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
  link.download = `creatorhub-eod-${snapshot.date}.png`;
  link.click();
  URL.revokeObjectURL(href);
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

  const download = async () => {
    setDownloading(true);
    try {
      await downloadSnapshotPng(snapshot, memberLabel);
      toast.success(`${formatDate(snapshot.date)} snapshot downloaded`);
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
        <div className="flex items-center gap-2">
          <div
            className="flex rounded-xl border border-border bg-bg-white p-1"
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
            className="btn btn-secondary min-h-10 gap-2 px-3 text-xs"
            disabled={downloading}
            onClick={download}
          >
            <Download size={14} aria-hidden />
            {downloading ? "Preparing…" : "Download PNG"}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
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
              <div className="space-y-1.5">
                {items.length === 0 ? (
                  <p className="text-[0.68rem] text-text-tertiary">
                    No entries
                  </p>
                ) : (
                  items.slice(0, 3).map((item) => (
                    <p
                      key={`${metric.key}-${item.id}`}
                      className="truncate text-[0.68rem] text-text-secondary"
                      title={itemLabel(item)}
                    >
                      <span className="font-semibold text-text-primary">
                        {item.creatorName}
                      </span>
                      {item.campaignId ? ` · ${item.campaignId}` : ""}
                    </p>
                  ))
                )}
                {items.length > 3 && (
                  <p className="text-[0.65rem] font-semibold text-text-tertiary">
                    +{items.length - 3} more
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
