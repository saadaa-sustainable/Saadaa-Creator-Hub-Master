export type OffboardingCreatorState = "candidate" | "offboarded";

/**
 * One creator-level offboarding row. Candidate rows are grouped from overdue,
 * unposted deliverables; offboarded rows come from the creator blacklist.
 */
export interface OffboardingCreator {
  state: OffboardingCreatorState;
  infId: string;
  name: string;
  username: string;
  instagramLink: string | null;
  profilePicUrl: string | null;
  category: string | null;
  followers: number | null;
  overdueDeliverables: number;
  overdueCollabs: number;
  oldestDeadline: string | null;
  daysOverdue: number;
  campaigns: string[];
  postIds: string[];
  teamMembers: string[];
  lastOnboardDate: string | null;
  blacklistReason: string | null;
  blacklistedAt: string | null;
  blacklistedBy: string | null;
}

export interface OffboardingKpi {
  candidates: number;
  overdueDeliverables: number;
  offboardedCreators: number;
  longestOverdueDays: number;
}

export interface OffboardingFilters {
  search?: string;
  campaign?: string;
}

export interface OffboardingFilterOptions {
  campaigns: { id: string; name: string }[];
}
