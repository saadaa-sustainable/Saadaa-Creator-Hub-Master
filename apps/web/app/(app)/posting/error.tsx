"use client";
import { AppErrorState } from "@/components/ui/app-error-state";

export default function PostingError({
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
      title="Couldn't load posting"
    />
  );
}
