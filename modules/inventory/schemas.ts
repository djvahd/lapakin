import { z } from 'zod';

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

const price = (label: string) =>
  z
    .number({ invalid_type_error: `${label} must be a number` })
    .min(0, `${label} cannot be negative`)
    .max(999_999_999_999.99, `${label} is too large`)
    .transform(round2);

// Harga varian yang kosong berarti memakai harga produk.
const optionalPrice = (label: string) =>
  z
    .number({ invalid_type_error: `${label} must be a number` })
    .min(0, `${label} cannot be negative`)
    .max(999_999_999_999.99, `${label} is too large`)
    .transform(round2)
    .nullish()
    .transform((v) => v ?? null);

// Jumlah stok: sampai 3 desimal (kg, meter), bukan nol.
const amount = (label: string) =>
  z
    .number({ invalid_type_error: `${label} must be a number` })
    .gt(0, `${label} must be greater than zero`)
    .max(1_000_000_000, `${label} is too large`)
    .transform(round3)
    .refine((n) => n > 0, `${label} must be greater than zero`);

// Kolom SKU yang dikosongkan dikirim form sebagai "": itu berarti tanpa SKU, bukan kesalahan.
const sku = z
  .union([z.literal(''), z.string().trim().max(64).regex(/^[^\s]+$/, 'SKU cannot contain spaces')])
  .nullish()
  .transform((v) => (v ? v : null));

export const variantInputSchema = z.object({
  name: z.string().trim().min(1, 'Variant name is required').max(100),
  sku,
  salePrice: optionalPrice('Sale price'),
  costPrice: optionalPrice('Cost price'),
});

export type VariantInput = z.output<typeof variantInputSchema>;

export const productInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  description: text(2000),
  unit: z
    .string()
    .trim()
    .min(1, 'Unit is required')
    .max(20)
    .default('pcs'),
  // SKU varian bawaan (produk sederhana cukup mengisi ini).
  sku,
  salePrice: price('Sale price').default(0),
  costPrice: price('Cost price').default(0),
  trackStock: z.boolean().default(true),
  reorderLevel: z
    .number({ invalid_type_error: 'Reorder level must be a number' })
    .min(0, 'Reorder level cannot be negative')
    .max(1_000_000_000)
    .transform(round3)
    .nullish()
    .transform((v) => v ?? null),
});

export type ProductInput = z.output<typeof productInputSchema>;

export const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  lowStock: z.boolean().default(false),
  archived: z.boolean().default(false),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});

export type ListQuery = z.output<typeof listQuerySchema>;

export const stockInputSchema = z.object({
  variantId: id,
  quantity: amount('Quantity'),
  note: text(500),
});

export type StockInput = z.output<typeof stockInputSchema>;

// Hasil hitung fisik: stok seharusnya sebesar ini; layanan membuat mutasi selisihnya.
export const adjustInputSchema = z.object({
  variantId: id,
  countedQuantity: z
    .number({ invalid_type_error: 'Counted quantity must be a number' })
    .min(0, 'Counted quantity cannot be negative')
    .max(1_000_000_000)
    .transform(round3),
  note: text(500),
});

export type AdjustInput = z.output<typeof adjustInputSchema>;

export const movementQuerySchema = z.object({
  variantId: id.optional(),
  productId: id.optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(30),
});

export type MovementQuery = z.output<typeof movementQuerySchema>;
