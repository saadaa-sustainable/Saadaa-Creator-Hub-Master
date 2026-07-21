import { redirect } from "next/navigation";
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
    <div>
      <PostAssetsView
        campaigns={campaigns}
        totalAssets={totalAssets}
        totalCreators={totalCreators}
      />
    </div>
  );
}
