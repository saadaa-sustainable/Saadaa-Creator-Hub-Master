/**
 * Ad tested/untested classification — single source of truth shared by the
 * Ad Status view and the Accounts Hub payment flag. Mirrors the logic in
 * features/ad-status/queries.ts exactly so both surfaces agree.
 *
 * `covered` is the Set of post_id_short values present in the Meta Ads
 * warehouse (uppercased), from `fetchMetaAdsCoveredPostIds()`.
 */

function rightsAreTrivial(adsUsageRights: string | null | undefined): boolean {
  const rights = String(adsUsageRights ?? "").trim().toLowerCase();
  return (
    rights === "" || rights === "no" || rights === "none" || rights === "-"
  );
}

function inWarehouse(
  postIdShort: string | null | undefined,
  covered: Set<string>,
): boolean {
  return covered.has(String(postIdShort ?? "").trim().toUpperCase());
}

/**
 * A post counts as an ad at all when it carries non-trivial ads_usage_rights
 * OR appears in the Meta Ads warehouse. Non-ads posts are never flagged.
 */
export function isAdEligible(
  adsUsageRights: string | null | undefined,
  postIdShort: string | null | undefined,
  covered: Set<string>,
): boolean {
  return !rightsAreTrivial(adsUsageRights) || inWarehouse(postIdShort, covered);
}

/**
 * Tested = classified (ads_results non-empty) OR present in the Meta Ads
 * warehouse. Matches Ad Status's "Ad Run" bucket.
 */
export function isAdTested(
  adsResults: string | null | undefined,
  postIdShort: string | null | undefined,
  covered: Set<string>,
): boolean {
  const classified = String(adsResults ?? "").trim() !== "";
  return classified || inWarehouse(postIdShort, covered);
}

/**
 * posted-but-not-tested = the post IS an ad (eligible) but has NOT been tested
 * yet. Non-ad posts and already-tested ads both return false.
 */
export function isPostedButNotTested(
  adsUsageRights: string | null | undefined,
  adsResults: string | null | undefined,
  postIdShort: string | null | undefined,
  covered: Set<string>,
): boolean {
  return (
    isAdEligible(adsUsageRights, postIdShort, covered) &&
    !isAdTested(adsResults, postIdShort, covered)
  );
}
