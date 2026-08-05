import { z } from "zod";

/**
 * Shared zod schemas (convention #9): used by forms client-side and reusable
 * from Edge Functions. The database re-validates everything regardless.
 */

export const hoursSchema = z
  .number()
  .positive()
  .max(24)
  .refine((h) => (h * 4) % 1 === 0, "Hours must be in 0.25 steps");

export const timeEntrySchema = z.object({
  project_id: z.string().uuid(),
  task_id: z.string().uuid().nullable(),
  work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hours: hoursSchema,
  note: z.string().max(500).optional().nullable(),
  billable: z.boolean().default(true),
});

export const clientSchema = z.object({
  name: z.string().min(1).max(200),
  legal_name: z.string().max(200).optional().nullable(),
  billing_address: z.string().max(1000).optional().nullable(),
  contact_email: z.string().email().optional().nullable(),
  currency: z.string().length(3),
  payment_terms_days: z.number().int().min(0).max(365).default(30),
  tax_rate_pct: z.number().min(0).max(100).default(0),
  invoice_grouping: z.enum(["project", "person", "role", "detailed"]).default("project"),
});

export const manualLineSchema = z.object({
  invoice_id: z.string().uuid(),
  description: z.string().min(1).max(500),
  amount_minor: z.number().int(),
});

export const generateDraftSchema = z
  .object({
    client_id: z.string().uuid(),
    period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine((v) => v.period_start <= v.period_end, "Period start must precede end");

export const rejectSchema = z.object({
  entry_id: z.string().uuid(),
  comment: z.string().min(3, "A meaningful comment is required").max(500),
});
