"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ClipboardList,
  Database,
  FileSpreadsheet,
  Receipt,
  Shield,
  ShoppingBag,
  Sparkles,
  Star,
  Truck,
  UserCircle2,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { SheetGrid } from "./sheet-grid";
import { BudgetSheet } from "./budget-sheet";
import type { SheetData, SheetTable } from "./types";

interface Props {
  tables: SheetTable[];
  active: SheetTable;
  data: SheetData;
  counts: Record<string, number>;
  canEdit: boolean;
  currentUserEmail?: string | null;
}

const TAB_ICONS: Record<string, LucideIcon> = {
  posts: ClipboardList,
  creators: Users,
  campaigns: Star,
  campaign_budget: Wallet,
  payments: Receipt,
  shopify_orders: ShoppingBag,
  system_errors: Zap,
  instagram_cache: Sparkles,
  inbound_reachout_queue: Truck,
  user_access: Shield,
};

export function SheetsBody({
  tables,
  active,
  data,
  counts,
  canEdit,
  currentUserEmail = null,
}: Props) {
  const [optimisticActiveId, setOptimisticActiveId] = useState(active.id);

  useEffect(() => {
    setOptimisticActiveId(active.id);
  }, [active.id]);

  return (
    <div className="flex flex-col gap-3 sm:gap-4 min-w-0">
      <TabBar
        tables={tables}
        activeId={active.id}
        optimisticActiveId={optimisticActiveId}
        counts={counts}
        onOptimisticActive={setOptimisticActiveId}
      />
      <div
        id="sheets-tabpanel"
        role="tabpanel"
        aria-labelledby={`sheets-tab-${active.id}`}
      >
        {active.variant === "budget" ? (
          <BudgetSheet table={active} rows={data.rows} canEdit={canEdit} />
        ) : (
          <SheetGrid
            table={active}
            rows={data.rows}
            canEdit={canEdit}
            currentUserEmail={currentUserEmail}
          />
        )}
      </div>
    </div>
  );
}

function TabBar({
  tables,
  activeId,
  optimisticActiveId,
  counts,
  onOptimisticActive,
}: {
  tables: SheetTable[];
  activeId: string;
  optimisticActiveId: string;
  counts: Record<string, number>;
  onOptimisticActive: (id: string) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  const hrefFor = useCallback(
    (tabId: string) => {
      const next = new URLSearchParams(params.toString());
      next.set("tab", tabId);
      const qs = next.toString();
      return `${pathname}${qs ? `?${qs}` : ""}`;
    },
    [params, pathname],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent, index: number) => {
      let nextIndex: number | null = null;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % tables.length;
      else if (event.key === "ArrowLeft")
        nextIndex = (index - 1 + tables.length) % tables.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = tables.length - 1;
      if (nextIndex === null) return;
      event.preventDefault();
      const target = tabRefs.current[nextIndex];
      target?.focus();
      target?.click();
    },
    [tables.length],
  );

  return (
    <div
      role="tablist"
      aria-label="Sheet tables"
      className="dash-tabbar flex items-center gap-1 overflow-x-auto"
      style={{ scrollbarWidth: "thin" }}
    >
      {tables.map((t, index) => {
        const isActive = t.id === optimisticActiveId;
        const isPendingSelection = optimisticActiveId !== activeId && isActive;
        const Icon = TAB_ICONS[t.id] ?? Database;
        const count = counts[t.id] ?? 0;
        const href = hrefFor(t.id);
        return (
          <Link
            key={t.id}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            href={href as never}
            prefetch
            scroll={false}
            role="tab"
            id={`sheets-tab-${t.id}`}
            aria-selected={isActive}
            aria-controls="sheets-tabpanel"
            tabIndex={isActive ? 0 : -1}
            onClick={() => onOptimisticActive(t.id)}
            onPointerEnter={() => router.prefetch(href as never)}
            onFocus={() => router.prefetch(href as never)}
            onKeyDown={(event) => onKeyDown(event, index)}
            data-active={isActive ? "true" : undefined}
            data-pending={isPendingSelection ? "true" : undefined}
            className={cn(
              "dash-tab-pill group relative inline-flex shrink-0 items-center justify-center",
              "gap-1.5 whitespace-nowrap rounded-[7px] px-3 py-1.5",
              "text-[0.72rem] font-extrabold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
              !isActive && "text-text-secondary hover:text-text-primary",
            )}
          >
            <Icon
              size={12}
              aria-hidden
              className={cn(
                "transition-colors",
                isActive ? "text-accent" : "text-text-tertiary",
              )}
            />
            <span>{t.label}</span>
            {count > 0 && (
              <span
                className={cn(
                  "inline-flex items-center justify-center min-w-[20px] h-4 px-1 rounded-full text-[0.55rem] font-extrabold tabular border",
                  isActive
                    ? "bg-accent/20 text-current border-accent/35"
                    : "bg-bg-muted text-text-tertiary border-border group-hover:bg-bg-surface",
                )}
              >
                {formatCount(count)}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

function formatCount(n: number): string {
  if (n >= 1000) {
    const k = n / 1000;
    return Number.isInteger(k) ? `${k}K` : `${k.toFixed(1)}K`;
  }
  return String(n);
}
