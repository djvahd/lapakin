import { z } from 'zod';
import { INVOICE_STATUSES, PAYMENT_METHODS } from './schema';

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

const amount = (label: string, round: (n: number) => number) =>
  z
    .number({ invalid_type_error: `${label} must be a number` })
    .gt(0, `${label} must be greater than zero`)
    .max(999_999_999_999.99, `${label} is too large`)
    .transform(round)
    .refine((n) => n > 0, `${label} must be greater than zero`);

export const invoiceInputSchema = z
  .object({
    issueDate: date('Issue date'),
    dueDate: date('Due date'),
    notes: text(2000),
    // Jumlah yang ditagih per baris pesanan (bisa sebagian).
    lines: z
      .array(z.object({ orderLineId: id, quantity: amount('Quantity', round3) }))
      .min(1, 'Choose at least one line'),
  })
  .refine((v) => v.dueDate >= v.issueDate, { message: 'Due date cannot be before the issue date', path: ['dueDate'] })
  .refine((v) => new Set(v.lines.map((l) => l.orderLineId)).size === v.lines.length, {
    message: 'Each line can appear only once',
    path: ['lines'],
  });

export type InvoiceInput = z.output<typeof invoiceInputSchema>;

export const paymentInputSchema = z.object({
  amount: amount('Amount', round2),
  paidOn: date('Payment date'),
  method: z.enum(PAYMENT_METHODS).default('transfer'),
  note: text(500),
});

export type PaymentInput = z.output<typeof paymentInputSchema>;

export const PAYMENT_FILTERS = ['unpaid', 'partial', 'paid', 'overdue', 'open'] as const;
export type PaymentFilter = (typeof PAYMENT_FILTERS)[number];

export const listQuerySchema = z.object({
  status: z.enum(INVOICE_STATUSES).optional(),
  // Status bayar, hanya untuk faktur terbit. `open` berarti masih ada sisa tagihan.
  payment: z.enum(PAYMENT_FILTERS).optional(),
  contactId: id.optional(),
  orderId: id.optional(),
  // Tanggal acuan jatuh tempo (YYYY-MM-DD); halaman mengisinya dengan hari ini.
  today: date('Today').default(() => new Date().toISOString().slice(0, 10)),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export type ListQuery = z.output<typeof listQuerySchema>;
