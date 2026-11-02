import {
  PAYMENT_FILTERS,
  invoiceInputSchema,
  listQuerySchema,
  paymentInputSchema,
  type InvoiceInput,
  type ListQuery,
  type PaymentInput,
} from './schemas';

// Penerjemah antara FormData / query string dan skema Zod. Murni (tanpa database), jadi mudah dites.

export type FormResult<T> = { ok: true; data: T } | { ok: false; error: string };

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : undefined;
};

const done = <T>(
  parsed: { success: true; data: T } | { success: false; error: { issues: { message: string }[] } }
): FormResult<T> =>
  parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

// Jumlah tagih per baris pesanan: field `qty-<orderLineId>`; kosong atau nol berarti tidak ditagih.
export function parseInvoiceForm(fd: FormData): FormResult<InvoiceInput> {
  const lines: { orderLineId: number; quantity: number }[] = [];
  for (const [key, value] of fd.entries()) {
    const m = /^qty-(\d+)$/.exec(key);
    if (!m || typeof value !== 'string' || !value.trim()) continue;
    const quantity = Number(value);
    if (quantity === 0) continue;
    lines.push({ orderLineId: Number(m[1]), quantity });
  }
  return done(
    invoiceInputSchema.safeParse({
      issueDate: text(fd, 'issueDate') ?? '',
      dueDate: text(fd, 'dueDate') ?? '',
      notes: text(fd, 'notes'),
      lines,
    })
  );
}

export function parsePaymentForm(fd: FormData): FormResult<PaymentInput> {
  const amount = text(fd, 'amount')?.trim();
  return done(
    paymentInputSchema.safeParse({
      amount: amount ? Number(amount) : undefined,
      paidOn: text(fd, 'paidOn') ?? '',
      method: text(fd, 'method') || undefined,
      note: text(fd, 'note'),
    })
  );
}

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const positiveInt = (v: string | string[] | undefined) => {
  const n = Number(first(v));
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

export function parseListParams(sp: SearchParams, today: string): ListQuery {
  const payment = first(sp.payment);
  return listQuerySchema.parse({
    payment: PAYMENT_FILTERS.find((p) => p === payment),
    contactId: positiveInt(sp.contact),
    page: positiveInt(sp.page) ?? 1,
    today,
  });
}

export function listHref(query: ListQuery, overrides: Partial<ListQuery> = {}): string {
  const q = { ...query, ...overrides };
  const p = new URLSearchParams();
  if (q.payment) p.set('payment', q.payment);
  if (q.contactId) p.set('contact', String(q.contactId));
  if (q.page > 1) p.set('page', String(q.page));
  const s = p.toString();
  return s ? `/dashboard/invoices?${s}` : '/dashboard/invoices';
}
