import { PagePlaceholder } from "@/components/ui/page-placeholder";
export default function Page() {
  return (
    <PagePlaceholder
      title="Cost Analytics"
      legacyRef="getBudgetVsActuals"
      description="Bucketed by month / tier / campaign. Joined with campaign_budget."
    />
  );
}
