import { z } from 'zod';
import { CONTACT_KINDS } from './schema';

// Teks opsional: string kosong menjadi null.
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const email = z
  .union([z.literal(''), z.string().trim().max(255).email('Invalid email address')])
  .nullish()
  .transform((v) => (v ? v : null));

const id = z.number().int().positive();

export const contactInputSchema = z
  .object({
    kind: z.enum(CONTACT_KINDS),
    name: z.string().trim().min(1, 'Name is required').max(200),
    companyId: id.nullish().transform((v) => v ?? null),
    email,
    phone: text(50),
    address: text(1000),
    notes: text(5000),
    isCustomer: z.boolean().default(false),
    isSupplier: z.boolean().default(false),
    tagIds: z
      .array(id)
      .max(50)
      .default([])
      .transform((ids) => [...new Set(ids)]),
  })
  .refine((v) => v.kind === 'person' || v.companyId === null, {
    message: 'Only a person can belong to a company',
    path: ['companyId'],
  });

export type ContactInput = z.output<typeof contactInputSchema>;

export const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  kind: z.enum(CONTACT_KINDS).optional(),
  role: z.enum(['customer', 'supplier']).optional(),
  tagId: id.optional(),
  archived: z.boolean().default(false),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export type ListQuery = z.output<typeof listQuerySchema>;

export const tagInputSchema = z.object({
  name: z.string().trim().min(1, 'Tag name is required').max(50),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color must look like #1a2b3c')
    .nullish()
    .transform((v) => v ?? null),
});

export type TagInput = z.output<typeof tagInputSchema>;
