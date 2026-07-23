"use client";
import { AppErrorState } from "@/components/ui/app-error-state";

export default function AccountsHubError({
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
      title="Couldn't load accounts hub"
    />
  );
}
