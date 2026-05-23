"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { AlertCircle } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // TODO: forward to Sentry once wired
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      icon={AlertCircle}
      title="Couldn't load the dashboard"
      description={error.message}
      action={<Button onClick={reset}>Retry</Button>}
    />
  );
}
