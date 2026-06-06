export interface AdStatusRow {
  postId: string;
  postIdShort: string;
  infId: string | null;
  /** Stamped collab_id, or fallback inf_id||'-C'||collab_number for legacy rows. */
  collabId: string | null;
  name: string;
  username: string;
  profilePicUrl: string | null;
  campaign: string;
  category: string | null;
  followers: number | null;
  workflowStatus: string;
  postDate: string | null;
  /** Days elapsed since post_date — used for urgency indicator in Untested section. */
  daysSince: number | null;
  linkToPost: string;
  downloadLink: string;
  adsUsageRights: string;
  /** Classification from warehouse sync: Winner / ITE / Discarded / Discarded but analyse / "" */
  adsResults: string;
  /** Raw Meta Ads platform status: active / paused / deleted / "" */
  adsStatus: string;
  isClassified: boolean;
  isInMetaAds: boolean;
  partnershipId: string;
  collabType: string;
}

export interface AdStatusKpi {
  totalEligible: number;
  classified: number;
  inMetaAds: number;
  pendingClassification: number;
  winners: number;
  discarded: number;
}

export interface AdStatusFilters {
  campaign?: string;
  /** Winner | ITE | Discarded | Discarded but analyse | __untested */
  classification?: string;
  /** Substring match on adsStatus — e.g. "run" matches "running" */
  adStatus?: string;
  search?: string;
}

export interface AdStatusFilterOptions {
  campaigns: { id: string; name: string }[];
}
