"use client";
import { AppErrorState } from "@/components/ui/app-error-state";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AppErrorState
      error={error}
      reset={reset}
      title="Couldn't load the dashboard"
    />
  );
}
