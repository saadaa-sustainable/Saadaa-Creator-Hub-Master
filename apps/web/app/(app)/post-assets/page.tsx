import { redirect } from "next/navigation";
import { Clapperboard } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { getActor } from "@/lib/auth";
import { PostAssetsView } from "@/features/post-assets/assets-view";
import { fetchPostAssets } from "@/features/post-assets/queries";

export const metadata = { title: "Post Assets" };

export default async function PostAssetsPage() {
  // Read-only gallery — any logged-in team member can browse.
  const actor = await getActor();
  if (!actor) redirect("/dashboard");

  const { campaigns, totalAssets, totalCreators } = await fetchPostAssets();

  return (
    <div className="onboarding-stage">
      <PageHeader
        icon={Clapperboard}
        title="Post Assets"
        knowMore="post-assets"
      />
      <PostAssetsView
        campaigns={campaigns}
        totalAssets={totalAssets}
        totalCreators={totalCreators}
      />
    </div>
  );
}
