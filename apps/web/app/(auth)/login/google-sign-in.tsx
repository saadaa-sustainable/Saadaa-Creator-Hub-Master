"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";

export function GoogleSignIn() {
  const params = useSearchParams();
  const reason = params.get("reason");
  const errorMsg = params.get("error");

  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const signIn = async () => {
    setLoading(true);
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: { access_type: "offline", prompt: "select_account" },
      },
    });
    if (error) {
      setLoading(false);
      console.error("OAuth init failed:", error);
    }
    // On success Supabase navigates the window — nothing else to do here.
  };

  return (
    <div className="space-y-3">
      {(reason === "revoked" || errorMsg) && (
        <div
          role="alert"
          className="rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-[0.78rem] text-warning"
        >
          {reason === "revoked"
            ? "Your access has been revoked or has expired. Sign in again with an authorised Saadaa account."
            : decodeURIComponent(errorMsg ?? "")}
        </div>
      )}

      <button
        type="button"
        onClick={signIn}
        disabled={loading}
        aria-busy={loading || undefined}
        className={cn(
          "w-full inline-flex items-center justify-center gap-3 rounded-md border border-border bg-bg-white px-4 py-3 text-sm font-semibold text-text-primary",
          "transition-colors hover:border-border-strong hover:bg-bg-alt",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        {loading ? (
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden
          />
        ) : (
          <GoogleGlyph />
        )}
        <span>{loading ? "Redirecting…" : "Continue with Google"}</span>
      </button>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      aria-hidden
      focusable="false"
    >
      <path
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.79 2.72v2.26h2.9c1.7-1.57 2.69-3.88 2.69-6.62Z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.9-2.26c-.81.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.71H.96v2.34A9 9 0 0 0 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.95 10.71A5.41 5.41 0 0 1 3.65 9c0-.6.1-1.17.3-1.71V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l2.99-2.34Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l2.99 2.34C4.66 5.17 6.65 3.58 9 3.58Z"
        fill="#EA4335"
      />
    </svg>
  );
}
