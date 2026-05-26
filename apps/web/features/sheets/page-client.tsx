"use client";

import { useState } from "react";
import Link from "next/link";
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
  return (
    <div className="flex flex-col gap-3 sm:gap-4 min-w-0">
      <TabBar tables={tables} activeId={active.id} counts={counts} />
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
  );
}

function TabBar({
  tables,
  activeId,
  counts,
}: {
  tables: SheetTable[];
  activeId: string;
  counts: Record<string, number>;
}) {
  return (
    <div className="rounded-2xl bg-bg-surface/70 backdrop-blur border border-border p-1.5 flex items-center gap-1 overflow-x-auto shadow-sm">
      {tables.map((t) => {
        const isActive = t.id === activeId;
        const Icon = TAB_ICONS[t.id] ?? Database;
        const count = counts[t.id] ?? 0;
        return (
          <Link
            key={t.id}
            href={`/sheets?tab=${t.id}`}
            scroll={false}
            className={cn(
              "group relative inline-flex items-center gap-1.5 px-3 h-9 rounded-lg text-[0.72rem] font-extrabold whitespace-nowrap transition-all",
              isActive
                ? "bg-bg-white text-text-primary border border-[--accent] shadow-md shadow-[--accent]/10 scale-[1.02]"
                : "text-text-secondary hover:bg-bg-white/70 hover:text-text-primary border border-transparent",
            )}
          >
            <Icon
              size={12}
              aria-hidden
              className={cn(
                "transition-colors",
                isActive ? "text-[--accent]" : "text-text-tertiary",
              )}
            />
            <span>{t.label}</span>
            {count > 0 && (
              <span
                className={cn(
                  "inline-flex items-center justify-center min-w-[20px] h-4 px-1 rounded-full text-[0.55rem] font-extrabold tabular border",
                  isActive
                    ? "bg-[--accent]/15 text-text-primary border-[--accent]/30"
                    : "bg-bg-muted text-text-tertiary border-border group-hover:bg-bg-surface",
                )}
              >
                {formatCount(count)}
              </span>
            )}
            {isActive && (
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 inline-block h-1 w-1 rounded-full bg-[--accent]" />
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
