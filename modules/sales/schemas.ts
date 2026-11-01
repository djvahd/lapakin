import { z } from 'zod';
import { ORDER_STATUSES } from './schema';

const id = z.number().int().positive();
const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const date = (label: string) =>
  z
    .string({ required_error: `${label} is required` })
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a date`)
    .refine((v) => !Number.isNaN(Date.parse(v)), `${label} must be a date`);

const amount = (label: string) =>
  z
    .number({ invalid_type_error: `${label} must be a number` })
    .gt(0, `${label} must be greater than zero`)
    .max(1_000_000_000, `${label} is too large`)
    .transform(round3)
    .refine((n) => n > 0, `${label} must be greater than zero`);

export const lineInputSchema = z.object({
  // Kosong untuk baris bebas (jasa, ongkos kirim) yang tidak menyentuh stok.
  variantId: id.nullish().transform((v) => v ?? null),
  description: z.string().trim().min(1, 'Description is required').max(300),
  quantity: amount('Quantity'),
  unitPrice: z
    .number({ invalid_type_error: 'Unit price must be a number' })
    .min(0, 'Unit price cannot be negative')
    .max(999_999_999_999.99, 'Unit price is too large')
    .transform(round2),
  discountPct: z
    .number({ invalid_type_error: 'Discount must be a number' })
    .min(0, 'Discount cannot be negative')
    .max(100, 'Discount cannot exceed 100%')
    .transform(round2)
    .default(0),
});

export type LineInput = z.output<typeof lineInputSchema>;

export const orderInputSchema = z
  .object({
    contactId: id,
    opportunityId: id.nullish().transform((v) => v ?? null),
    issueDate: date('Issue date'),
    validUntil: date('Valid until').nullish().transform((v) => v ?? null),
    notes: text(2000),
    lines: z.array(lineInputSchema).min(1, 'Add at least one line').max(100, 'Too many lines'),
  })
  .refine((v) => v.validUntil === null || v.validUntil >= v.issueDate, {
    message: 'Valid until cannot be before the issue date',
    path: ['validUntil'],
  });

export type OrderInput = z.output<typeof orderInputSchema>;

export const listQuerySchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  contactId: id.optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export type ListQuery = z.output<typeof listQuerySchema>;

export const deliveryInputSchema = z
  .object({
    lines: z
      .array(z.object({ orderLineId: id, quantity: amount('Quantity') }))
      .min(1, 'Choose at least one line'),
    note: text(500),
  })
  .refine((v) => new Set(v.lines.map((l) => l.orderLineId)).size === v.lines.length, {
    message: 'Each line can appear only once',
    path: ['lines'],
  });

export type DeliveryInput = z.output<typeof deliveryInputSchema>;
