import { z } from 'zod';
import { ACTIVITY_KINDS } from './schema';

const id = z.number().int().positive();

// Tanggal "YYYY-MM-DD" yang benar-benar ada di kalender (2026-02-30 ditolak).
const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, 'Not a valid date');

const optionalDate = z
  .union([z.literal(''), isoDate])
  .nullish()
  .transform((v) => (v ? v : null));

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const round2 = (n: number) => Math.round(n * 100) / 100;

export const opportunityInputSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  contactId: id.nullish().transform((v) => v ?? null),
  // Kosong saat membuat: layanan memakai tahap terbuka pertama.
  stageId: id.nullish().transform((v) => v ?? null),
  expectedValue: z
    .number({ invalid_type_error: 'Expected value must be a number' })
    .min(0, 'Expected value cannot be negative')
    .max(999_999_999_999.99, 'Expected value is too large')
    .default(0)
    .transform(round2),
  expectedCloseDate: optionalDate,
  priority: z.number().int().min(0).max(3).default(0),
  // Kosong saat membuat: layanan memakai pembuatnya.
  ownerId: id.nullish().transform((v) => v ?? null),
  notes: text(5000),
});

export type OpportunityInput = z.output<typeof opportunityInputSchema>;

export const boardQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  ownerId: id.optional(),
});

export type BoardQuery = z.output<typeof boardQuerySchema>;

export const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  stageId: id.optional(),
  ownerId: id.optional(),
  archived: z.boolean().default(false),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export type ListQuery = z.output<typeof listQuerySchema>;

export const moveInputSchema = z.object({
  stageId: id,
  // Hanya dipakai bila tahap tujuan berjenis lost.
  lostReason: text(500),
});

export type MoveInput = z.output<typeof moveInputSchema>;

export const activityInputSchema = z.object({
  opportunityId: id,
  kind: z.enum(ACTIVITY_KINDS),
  summary: z.string().trim().min(1, 'Summary is required').max(200),
  dueDate: isoDate,
  assignedTo: id.nullish().transform((v) => v ?? null),
});

export type ActivityInput = z.output<typeof activityInputSchema>;
