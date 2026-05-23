import { notFound } from "next/navigation";
import { PagePlaceholder } from "@/components/ui/page-placeholder";
import { createClient } from "@/lib/supabase/server";

export default async function CreatorPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("creators")
    .select("*")
    .eq("username", username)
    .maybeSingle();
  if (!data) notFound();
  const creator = data as any;

  return (
    <PagePlaceholder
      title={creator.inf_name ?? `@${creator.username}`}
      legacyRef="getInfluencerData + getInfluencerList join"
      description={`Profile drill-down for @${creator.username}. Phase: collabs + posts + payments + errors tabs. Modal variant lives at @modal/(.)creators/[username].`}
    />
  );
}
