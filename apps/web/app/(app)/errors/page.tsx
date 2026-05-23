import { PagePlaceholder } from "@/components/ui/page-placeholder";
export default function Page() {
  return (
    <PagePlaceholder
      title="Errors"
      legacyRef="runErrorAudit + getInstagramFetchErrors + getSystemErrors + getMissingCollabEmails"
      description="Error Portal — Audit results + IG fetch errors + System errors + Missing collab emails."
    />
  );
}
