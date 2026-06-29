/**
 * Issue Desk — support/issue tickets. UI ported from the DAM project; data +
 * palette are CreatorHub's. Anyone authenticated raises a ticket; admins resolve.
 */

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type TicketCategory =
  | "workflow"
  | "access"
  | "data"
  | "bug"
  | "suggestion"
  | "other";
export type TicketPriority = "low" | "medium" | "high" | "urgent";

export interface SupportTicket {
  id: number;
  ticketNo: string;
  title: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  requesterName: string | null;
  requesterEmail: string | null;
  requesterRole: string | null;
  sourcePath: string | null;
  assignedAdminEmail: string | null;
  adminNote: string | null;
  resolution: string | null;
  lastAdminResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type TicketCountKey = TicketStatus | "all" | "urgent";

export interface SupportTicketDeskData {
  tickets: SupportTicket[];
  counts: Record<TicketCountKey, number>;
  isAdmin: boolean;
}

/** Autocomplete suggestion linking a ticket to a CreatorHub entity. */
export interface TicketReference {
  type: "campaign" | "creator" | "collab";
  id: string;
  label: string;
}
