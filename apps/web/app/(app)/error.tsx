"use client";
import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // TODO: Sentry capture
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      icon={AlertCircle}
      title="Something went wrong"
      description={error.message}
      action={<Button onClick={reset}>Retry</Button>}
    />
  );
}
