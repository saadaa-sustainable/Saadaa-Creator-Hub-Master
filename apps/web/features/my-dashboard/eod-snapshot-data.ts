import type { MyPost } from "./types";

export interface DailySnapshotItem {
  id: number;
  infId: string | null;
  postId: string | null;
  collabId: string | null;
  creatorName: string;
  username: string | null;
  campaignId: string | null;
  contentType: string | null;
  estDelivery: string | null;
}

export interface DailySnapshot {
  date: string;
  reachouts: DailySnapshotItem[];
  onboarded: DailySnapshotItem[];
  posted: DailySnapshotItem[];
  edd: DailySnapshotItem[];
  overdue: DailySnapshotItem[];
}

const norm = (value: unknown) => String(value ?? "").trim();
const dateKey = (value: string | null | undefined) =>
  String(value ?? "").slice(0, 10);
const OVERDUE_DELIVERY_STATUSES = ["On Board", "Order Sent"] as const;

export function isOverdueDelivery(post: MyPost, date: string): boolean {
  return (
    (OVERDUE_DELIVERY_STATUSES as readonly string[]).includes(
      post.workflow_status ?? "",
    ) &&
    Boolean(post.est_delivery) &&
    dateKey(post.est_delivery) < date
  );
}

function previousIsoDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day));
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}

function collabKey(post: MyPost): string {
  return (
    post.collab_id ??
    (post.inf_id && post.collab_number != null
      ? `${post.inf_id}-C${Number(post.collab_number)}`
      : null) ??
    post.post_id ??
    `id:${post.id}`
  );
}

function toItem(post: MyPost): DailySnapshotItem {
  const infId = post.inf_id ?? post.creator?.inf_id ?? null;
  return {
    id: post.id,
    infId,
    postId: post.post_id_short ?? post.post_id ?? null,
    collabId:
      post.collab_id ??
      (infId && post.collab_number != null
        ? `${infId}-C${Number(post.collab_number)}`
        : null),
    creatorName:
      post.creator?.inf_name ??
      post.inf_name ??
      post.username ??
      "Unnamed creator",
    username: post.username,
    campaignId: post.campaign_id,
    contentType: post.content_type ?? null,
    estDelivery: post.est_delivery,
  };
}

function uniqueByCollab(posts: MyPost[]): MyPost[] {
  const seen = new Set<string>();
  return posts.filter((post) => {
    const key = collabKey(post);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Builds the member's today/yesterday activity independently of the current
 * workflow stage, so a reach-out still appears after it is onboarded later.
 */
export function buildDailySnapshots(
  posts: MyPost[],
  member: string,
  today: string,
): DailySnapshot[] {
  const livePosts = posts.filter((post) => !post.is_test);
  const reachOwnerByCollab = new Map<string, string>();
  for (const post of livePosts) {
    const loggedBy = norm(post.logged_by);
    if (loggedBy) reachOwnerByCollab.set(collabKey(post), loggedBy);
  }
  const reachOwner = (post: MyPost) =>
    reachOwnerByCollab.get(collabKey(post)) ||
    norm(post.logged_by) ||
    norm(post.onboarded_by);
  const onboardOwner = (post: MyPost) =>
    norm(post.onboarded_by) || norm(post.logged_by);
  const postOwner = (post: MyPost) =>
    norm(post.posted_by) || onboardOwner(post);
  const overdue = livePosts.filter(
    (post) =>
      onboardOwner(post) === member && isOverdueDelivery(post, today),
  );

  return [today, previousIsoDate(today)].map((date) => {
    const reachouts = uniqueByCollab(
      livePosts.filter(
        (post) =>
          reachOwner(post) === member && dateKey(post.reach_out_date) === date,
      ),
    );
    const onboarded = uniqueByCollab(
      livePosts.filter(
        (post) =>
          onboardOwner(post) === member && dateKey(post.onboard_date) === date,
      ),
    );
    const posted = livePosts.filter(
      (post) => postOwner(post) === member && dateKey(post.post_date) === date,
    );
    const edd = livePosts.filter(
      (post) =>
        onboardOwner(post) === member && dateKey(post.est_delivery) === date,
    );
    return {
      date,
      reachouts: reachouts.map(toItem),
      onboarded: onboarded.map(toItem),
      posted: posted.map(toItem),
      edd: edd.map(toItem),
      overdue: overdue.map(toItem),
    };
  });
}
