"use client";
import { Menu } from "lucide-react";
import { Button } from "../ui/button";
import type { UserAccessRow } from "@/lib/supabase/types.gen";

export function Topbar({ actor }: { actor: UserAccessRow }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-bg-base/80 backdrop-blur px-4 lg:px-6">
      <Button
        variant="ghost"
        size="sm"
        className="lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <div className="font-display font-bold lg:hidden">CreatorHub</div>
      <div className="ml-auto flex items-center gap-3 text-sm text-text-secondary">
        <span
          className="hidden sm:inline truncate max-w-[160px]"
          title={actor.email}
        >
          {actor.name ?? actor.email}
        </span>
      </div>
    </header>
  );
}
