/**
 * Offboarding types — terminal-stage ledger (Wave 9, req #7 / D11).
 *
 * One row per `posts` record whose `workflow_status` = 'Offboarding'. This is
 * a manual terminal state set by an authorized operator (offboarding_write).
 * The collab is out of the active pipeline but stays visible in Accounts Hub
 * until the creator is fully paid.
 */
export interface OffboardingRow {
  postId: string;
  collabId?: string | null;
  collabNumber?: number | null;
  infId: string | null;
  name: string;
  username: string;
  profilePicUrl: string | null;
  campaign: string;
  category: string | null;
  followers: number | null;
  collabType: string | null;
  commercials: number;
  orderId: string;
  paymentStatus: string;
  workflowStatus: string;
  reachoutDate: string | null;
}

export interface OffboardingKpi {
  total: number;
  paid: number;
  awaitingPayment: number;
  totalCommercials: number;
}

export interface OffboardingFilters {
  search?: string;
  campaign?: string;
  paymentStatus?: "Done" | "Due" | "Not Due" | "";
}

export interface OffboardingFilterOptions {
  campaigns: { id: string; name: string }[];
}
