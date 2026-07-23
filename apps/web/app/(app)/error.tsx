"use client";
import { AppErrorState } from "@/components/ui/app-error-state";

export default function AppError({
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
      title="Something went wrong"
    />
  );
}
