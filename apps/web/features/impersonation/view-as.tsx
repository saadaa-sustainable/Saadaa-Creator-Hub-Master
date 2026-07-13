"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, LogOut } from "lucide-react";
import { toast } from "sonner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { startActingAs, stopActingAs } from "./actions";

export interface ViewAsTarget {
  email: string;
  name: string;
  role: string | null;
}

/**
 * "View as" control for Global Admins on My Dashboard.
 * Picking a member starts acting-as (cookie set server-side): the dashboard
 * shows THEIR numbers and every stage form submitted while acting is
 * attributed to them. A persistent banner (here + the top bar pill) keeps the
 * impersonation visible until Exit.
 */
export function ViewAsControl({
  members,
  actingAs,
}: {
  members: ViewAsTarget[];
  actingAs: ViewAsTarget | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const change = (email: string) => {
    startTransition(async () => {
      const res = email ? await startActingAs(email) : await stopActingAs();
      if (!res.success) {
        toast.error(res.error ?? "Could not switch member.");
        return;
      }
      toast.success(
        email ? `Now viewing as ${res.name}.` : "Back to your own dashboard.",
      );
      router.refresh();
    });
  };

  if (members.length === 0 && !actingAs) return null;

  return (
    <section
      className="rounded-2xl border px-4 py-3 sm:px-5 flex flex-wrap items-center gap-3"
      style={
        actingAs
          ? {
              background: "#FAF1DC",
              borderColor: "rgba(181, 117, 20, 0.35)",
            }
          : {
              background: "var(--bg-surface, #F5F1EC)",
              borderColor: "var(--border, #E7E2D2)",
            }
      }
      aria-busy={pending}
    >
      {actingAs ? (
        <>
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
            style={{ background: "#B57514" }}
            aria-hidden
          >
            {actingAs.name.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm text-[#161513]">
                Viewing as {actingAs.name}
              </strong>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FDECEA] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[#C0392B]">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[#C0392B] animate-pulse"
                  aria-hidden
                />
                Acting as
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[#6E695E]">
              {actingAs.role ?? "Team member"} · Forms you submit anywhere in
              CreatorHub are recorded under {actingAs.name}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => change("")}
            disabled={pending}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[10px] border border-[#C0392B]/35 bg-white px-3.5 py-2 text-xs font-semibold text-[#C0392B] transition hover:bg-[#FDECEA] disabled:opacity-60"
          >
            <LogOut size={13} aria-hidden />
            Exit — back to me
          </button>
        </>
      ) : (
        <>
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ background: "#F0EAD6", color: "#6E695E" }}
            aria-hidden
          >
            <Eye size={14} />
          </span>
          <div className="min-w-0">
            <strong className="block text-sm text-[#161513]">
              View as team member
            </strong>
            <p className="text-xs text-[#9A9384]">
              See their dashboard and submit forms on their behalf.
            </p>
          </div>
          <div className="ml-auto w-full sm:w-64">
            <SearchableSelect
              value=""
              onChange={(v) => v && change(v)}
              options={[
                { value: "", label: "— Myself —" },
                ...members.map((m) => ({
                  value: m.email,
                  label: m.role ? `${m.name} · ${m.role}` : m.name,
                })),
              ]}
              placeholder="— Myself —"
              searchPlaceholder="Search team members…"
            />
          </div>
        </>
      )}
    </section>
  );
}
