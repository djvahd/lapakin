import {
  adjustInputSchema,
  listQuerySchema,
  productInputSchema,
  stockInputSchema,
  variantInputSchema,
  type AdjustInput,
  type ListQuery,
  type ProductInput,
  type StockInput,
  type VariantInput,
} from './schemas';

// Penerjemah antara FormData / query string dan skema Zod. Murni (tanpa database), jadi mudah dites.

export type FormResult<T> = { ok: true; data: T } | { ok: false; error: string };

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : undefined;
};

// Kolom angka yang dikosongkan berarti "tidak diisi"; teks bukan angka tetap diteruskan agar ditolak skema.
const num = (fd: FormData, key: string): number | undefined => {
  const v = text(fd, key)?.trim();
  return v ? Number(v) : undefined;
};

const done = <T>(
  parsed: { success: true; data: T } | { success: false; error: { issues: { message: string }[] } }
): FormResult<T> =>
  parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

export const parseProductForm = (fd: FormData): FormResult<ProductInput> =>
  done(
    productInputSchema.safeParse({
      name: text(fd, 'name') ?? '',
      description: text(fd, 'description'),
      unit: text(fd, 'unit') || undefined,
      sku: text(fd, 'sku'),
      salePrice: num(fd, 'salePrice'),
      costPrice: num(fd, 'costPrice'),
      trackStock: fd.get('trackStock') === 'on',
      reorderLevel: num(fd, 'reorderLevel') ?? null,
    })
  );

export const parseVariantForm = (fd: FormData): FormResult<VariantInput> =>
  done(
    variantInputSchema.safeParse({
      name: text(fd, 'name') ?? '',
      sku: text(fd, 'sku'),
      salePrice: num(fd, 'salePrice') ?? null,
      costPrice: num(fd, 'costPrice') ?? null,
    })
  );

export const parseStockForm = (fd: FormData): FormResult<StockInput> =>
  done(stockInputSchema.safeParse({ variantId: num(fd, 'variantId'), quantity: num(fd, 'quantity'), note: text(fd, 'note') }));

export const parseAdjustForm = (fd: FormData): FormResult<AdjustInput> =>
  done(
    adjustInputSchema.safeParse({
      variantId: num(fd, 'variantId'),
      countedQuantity: num(fd, 'countedQuantity'),
      note: text(fd, 'note'),
    })
  );

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const positiveInt = (v: string | string[] | undefined) => {
  const n = Number(first(v));
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

export function parseListParams(sp: SearchParams): ListQuery {
  return listQuerySchema.parse({
    q: first(sp.q)?.trim() || undefined,
    lowStock: first(sp.low) === '1',
    archived: first(sp.archived) === '1',
    page: positiveInt(sp.page) ?? 1,
  });
}

export function listHref(query: ListQuery, overrides: Partial<ListQuery> = {}): string {
  const q = { ...query, ...overrides };
  const p = new URLSearchParams();
  if (q.q) p.set('q', q.q);
  if (q.lowStock) p.set('low', '1');
  if (q.archived) p.set('archived', '1');
  if (q.page > 1) p.set('page', String(q.page));
  const s = p.toString();
  return s ? `/dashboard/inventory?${s}` : '/dashboard/inventory';
}
