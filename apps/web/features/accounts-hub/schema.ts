import { z } from "zod";

/**
 * Single payment submit — mirrors legacy `submitPayments` per-row payload.
 *
 * Server resolves `match_status` (Matched / Not Matched / Unverified) based on
 * `amount` vs `posts.commercial_amount`. Optional bank fields are passed
 * through for compliance archival but not enforced here.
 */
export const PaymentSubmitSchema = z.object({
  postId: z.string().trim().min(1, "Post ID required"),
  utr: z.string().trim().min(1, "UTR / reference required"),
  paymentDate: z
    .string()
    .trim()
    .min(1, "Payment date required")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use yyyy-MM-dd"),
  amount: z
    .number({ invalid_type_error: "Amount must be a number" })
    .gt(0, "Amount must be greater than zero"),
  bankName: z.string().trim().optional().default(""),
  bankNumber: z.string().trim().optional().default(""),
  ifsc: z.string().trim().optional().default(""),
});

export type PaymentSubmitInput = z.infer<typeof PaymentSubmitSchema>;

/**
 * Bulk batch — operator submits N rows in one go (multi-row inline form OR
 * Excel/CSV paste import). Capped at 200 per submission to keep the lock
 * window reasonable (legacy uses 15s LockService).
 */
export const PaymentBatchSchema = z.object({
  rows: z.array(PaymentSubmitSchema).min(1).max(200),
});

export type PaymentBatchInput = z.infer<typeof PaymentBatchSchema>;
