"use client";

/**
 * 30-day per-user activity sparkline. Bars represent calendar days
 * (most recent on the right). A day with activity = solid bar; no
 * activity = ghost bar.
 */
export function ActivitySparkline({
  days,
  height = 18,
  width = 96,
  className,
}: {
  days: string[];
  height?: number;
  width?: number;
  className?: string;
}) {
  const dayKeys = buildLastNDays(30);
  const active = new Set(days);
  const barWidth = width / dayKeys.length;
  const padded = barWidth - Math.max(1, Math.floor(barWidth / 3));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`Activity for the last ${dayKeys.length} days`}
      className={className}
    >
      {dayKeys.map((day, i) => {
        const x = i * barWidth + (barWidth - padded) / 2;
        const isActive = active.has(day);
        const h = isActive ? height - 2 : 4;
        const y = height - h - 1;
        return (
          <rect
            key={day}
            x={x}
            y={y}
            width={padded}
            height={h}
            rx={1}
            fill={isActive ? "var(--accent, #F0C61E)" : "rgba(0,0,0,0.08)"}
          />
        );
      })}
    </svg>
  );
}

function buildLastNDays(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
