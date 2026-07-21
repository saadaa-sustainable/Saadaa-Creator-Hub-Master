import { Suspense } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/formatters";
import { GoogleSignIn } from "./google-sign-in";

export const metadata = { title: "Sign in" };

interface LoginStats {
  creators: number;
  campaigns: number;
  posts: number;
}

/**
 * Static-ish landing stats — pulled fresh once per minute. Cheap COUNTs;
 * fine to compute on every render in dev.
 */
async function getLoginStats(): Promise<LoginStats> {
  try {
    const supabase = createServiceClient();
    const [c, k, p] = await Promise.all([
      supabase.from("creators").select("*", { count: "exact", head: true }),
      supabase.from("campaigns").select("*", { count: "exact", head: true }),
      supabase.from("posts").select("*", { count: "exact", head: true }),
    ]);
    return {
      creators: c.count ?? 0,
      campaigns: k.count ?? 0,
      posts: p.count ?? 0,
    };
  } catch {
    // Auth landing must not fail just because counts errored.
    return { creators: 0, campaigns: 0, posts: 0 };
  }
}

export default async function LoginPage() {
  const stats = await getLoginStats();

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-bg-base">
      {/* ============= Left — brand panel ================================= */}
      <aside className="relative overflow-hidden bg-[#0E0C0A] text-white">
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.35) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
          aria-hidden
        />

        <div className="relative h-full flex flex-col justify-between p-8 lg:p-12 min-h-[420px]">
          <header className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-md bg-white shadow-[0_0_0_4px_rgba(240,198,30,0.18)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/brand-logo.png"
                alt="CreatorHub logo"
                className="h-full w-full object-contain"
              />
            </span>
            <span className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-white/55">
              Saadaa · Internal
            </span>
          </header>

          <div className="space-y-6 max-w-md">
            <span className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-[0.7rem] font-bold uppercase tracking-[0.16em] text-accent">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)]" />
              Influencer Management
            </span>

            <h1 className="font-display text-5xl lg:text-7xl font-bold leading-[0.95] tracking-tight">
              CreatorHub
            </h1>

            <p className="text-base lg:text-lg text-white/65 leading-relaxed max-w-sm">
              One source of truth for every creator, campaign, and collab.
            </p>
          </div>

          <footer className="space-y-6">
            <Suspense fallback={null}>
              <StatGrid stats={stats} />
            </Suspense>
            <p className="text-[0.7rem] text-white/40 font-medium tracking-wide">
              v3.0 · Google OAuth · Supabase
            </p>
          </footer>
        </div>
      </aside>

      {/* ============= Right — sign-in card =============================== */}
      <main className="relative grid place-items-center px-6 py-12 lg:px-12">
        <div
          className="absolute inset-0 opacity-[0.5] pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(rgba(0,0,0,0.04) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
          aria-hidden
        />
        <div className="relative w-full max-w-md rounded-lg bg-bg-white border border-border-soft shadow-[0_24px_60px_-24px_rgba(0,0,0,0.18)] p-8 lg:p-10 space-y-6">
          <div className="space-y-1">
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-text-tertiary">
              Sign in
            </p>
            <h2 className="font-display text-3xl font-bold leading-tight tracking-tight">
              Welcome back
            </h2>
            <p className="text-sm text-text-secondary">
              Use your{" "}
              <span className="rounded-sm bg-bg-muted px-1.5 py-0.5 font-mono text-[0.82rem] text-text-primary">
                @saadaa.in
              </span>{" "}
              Google account.
            </p>
          </div>

          <Suspense fallback={<div className="h-12 rounded-md bg-bg-muted animate-pulse" />}>
            <GoogleSignIn />
          </Suspense>

          <div className="pt-4 border-t border-border-soft flex items-center justify-between text-[0.72rem] text-text-tertiary">
            <span>SSO via Google Workspace</span>
            <span className="tabular">v3.0</span>
          </div>
        </div>
      </main>
    </div>
  );
}

function StatGrid({ stats }: { stats: LoginStats }) {
  const items: { label: string; value: number }[] = [
    { label: "Creators", value: stats.creators },
    { label: "Campaigns", value: stats.campaigns },
    { label: "Posts", value: stats.posts },
  ];
  return (
    <div className="grid grid-cols-3 gap-3 max-w-md">
      {items.map((it) => (
        <div
          key={it.label}
          className="rounded-md border border-white/10 bg-white/[0.03] px-3.5 py-3 backdrop-blur-sm"
        >
          <div className="text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-white/45">
            {it.label}
          </div>
          <div className="mt-1 font-emph text-2xl font-bold tabular text-white">
            {formatNumber(it.value)}
          </div>
        </div>
      ))}
    </div>
  );
}
