import { z } from "zod";

/**
 * Single payment submit — mirrors legacy `submitPayments` per-row payload.
 *
 * Server validates `amount` against `posts.commercial_amount` (no separate
 * match_status column anymore — diff is derived in the ledger UI). Optional
 * bank fields are passed through for compliance archival but not enforced
 * here.
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
 * Excel/CSV paste import). REQ #10b: capped at 10 rows per submission (the
 * entry form enforces the same MAX_PAYMENT_ROWS in payment-form.tsx).
 */
export const PaymentBatchSchema = z.object({
  rows: z.array(PaymentSubmitSchema).min(1).max(10),
});

export type PaymentBatchInput = z.infer<typeof PaymentBatchSchema>;
