"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

const RELOAD_KEY = "creatorhub:stale-server-action-reload";
const RELOAD_COOLDOWN_MS = 60_000;

export function shouldReloadForStaleServerAction(
  message: string,
  lastReloadAt: number | null,
  now = Date.now(),
) {
  return (
    message.includes("Server Action") &&
    message.includes("was not found on the server") &&
    (!lastReloadAt || now - lastReloadAt > RELOAD_COOLDOWN_MS)
  );
}

export function AppErrorState({
  error,
  reset,
  title,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
}) {
  const staleServerAction =
    error.message.includes("Server Action") &&
    error.message.includes("was not found on the server");

  useEffect(() => {
    console.error(error);

    if (!staleServerAction) return;

    const lastReloadAt = Number(sessionStorage.getItem(RELOAD_KEY)) || null;
    if (shouldReloadForStaleServerAction(error.message, lastReloadAt)) {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
      window.location.reload();
    }
  }, [error, staleServerAction]);

  return (
    <EmptyState
      icon={AlertCircle}
      title={title}
      description={
        staleServerAction
          ? "CreatorHub was updated while this tab was open. Reload to continue."
          : error.message
      }
      action={
        <Button
          onClick={
            staleServerAction ? () => window.location.reload() : reset
          }
        >
          {staleServerAction ? "Reload" : "Retry"}
        </Button>
      }
    />
  );
}
