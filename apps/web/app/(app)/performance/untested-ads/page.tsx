import { PagePlaceholder } from "@/components/ui/page-placeholder";
export default function Page() {
  return (
    <PagePlaceholder
      title="Performance — Untested Ads"
      legacyRef="getUntestedAds"
      description="Posted ads not yet classified by the warehouse. Force re-sync action."
    />
  );
}
