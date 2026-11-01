import {
  deliveryInputSchema,
  listQuerySchema,
  orderInputSchema,
  type DeliveryInput,
  type ListQuery,
  type OrderInput,
} from './schemas';
import { ORDER_STATUSES } from './schema';

// Penerjemah antara FormData / query string dan skema Zod. Murni (tanpa database), jadi mudah dites.

export type FormResult<T> = { ok: true; data: T } | { ok: false; error: string };

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : undefined;
};

const all = (fd: FormData, key: string) => fd.getAll(key).map((v) => (typeof v === 'string' ? v : ''));

// Kolom angka yang dikosongkan berarti "tidak diisi"; teks bukan angka tetap diteruskan agar ditolak skema.
const toNum = (v: string | undefined): number | undefined => {
  const t = v?.trim();
  return t ? Number(t) : undefined;
};

const done = <T>(
  parsed: { success: true; data: T } | { success: false; error: { issues: { message: string }[] } }
): FormResult<T> =>
  parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

// Baris penawaran dikirim sebagai kolom berulang yang sejajar (variantId, description, quantity, ...).
// Baris yang seluruhnya kosong (baris cadangan di form) dilewati.
export function parseOrderForm(fd: FormData): FormResult<OrderInput> {
  const variantIds = all(fd, 'variantId');
  const descriptions = all(fd, 'description');
  const quantities = all(fd, 'quantity');
  const prices = all(fd, 'unitPrice');
  const discounts = all(fd, 'discountPct');

  const lines = descriptions
    .map((description, i) => ({
      variantId: toNum(variantIds[i]) ?? null,
      description,
      quantity: toNum(quantities[i]),
      unitPrice: toNum(prices[i]),
      discountPct: toNum(discounts[i]) ?? 0,
    }))
    .filter((l) => l.description.trim() || l.variantId !== null || l.quantity !== undefined || l.unitPrice !== undefined);

  return done(
    orderInputSchema.safeParse({
      contactId: toNum(text(fd, 'contactId')),
      opportunityId: toNum(text(fd, 'opportunityId')) ?? null,
      issueDate: text(fd, 'issueDate') ?? '',
      validUntil: text(fd, 'validUntil') || null,
      notes: text(fd, 'notes'),
      lines,
    })
  );
}

// Jumlah kirim per baris pesanan: field `qty-<orderLineId>`; kosong atau nol berarti tidak dikirim.
export function parseDeliveryForm(fd: FormData): FormResult<DeliveryInput> {
  const lines: { orderLineId: number; quantity: number }[] = [];
  for (const [key, value] of fd.entries()) {
    const m = /^qty-(\d+)$/.exec(key);
    if (!m || typeof value !== 'string' || !value.trim()) continue;
    const quantity = Number(value);
    if (quantity === 0) continue;
    lines.push({ orderLineId: Number(m[1]), quantity });
  }
  return done(deliveryInputSchema.safeParse({ lines, note: text(fd, 'note') }));
}

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const positiveInt = (v: string | string[] | undefined) => {
  const n = Number(first(v));
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

export function parseListParams(sp: SearchParams): ListQuery {
  const status = first(sp.status);
  return listQuerySchema.parse({
    status: ORDER_STATUSES.find((s) => s === status),
    contactId: positiveInt(sp.contact),
    page: positiveInt(sp.page) ?? 1,
  });
}

export function listHref(query: ListQuery, overrides: Partial<ListQuery> = {}): string {
  const q = { ...query, ...overrides };
  const p = new URLSearchParams();
  if (q.status) p.set('status', q.status);
  if (q.contactId) p.set('contact', String(q.contactId));
  if (q.page > 1) p.set('page', String(q.page));
  const s = p.toString();
  return s ? `/dashboard/sales?${s}` : '/dashboard/sales';
}
