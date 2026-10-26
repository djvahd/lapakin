import { CONTACT_KINDS } from './schema';
import { contactInputSchema, listQuerySchema, type ContactInput, type ListQuery } from './schemas';

// Penerjemah antara FormData / query string dan skema Zod. Murni (tanpa database), jadi mudah dites.

export type FormResult<T> = { ok: true; data: T } | { ok: false; error: string };

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : undefined;
};

export function parseContactForm(fd: FormData): FormResult<ContactInput> {
  const company = text(fd, 'companyId');
  const parsed = contactInputSchema.safeParse({
    kind: text(fd, 'kind'),
    name: text(fd, 'name') ?? '',
    companyId: company ? Number(company) : null,
    email: text(fd, 'email'),
    phone: text(fd, 'phone'),
    address: text(fd, 'address'),
    notes: text(fd, 'notes'),
    isCustomer: fd.get('isCustomer') === 'on',
    isSupplier: fd.get('isSupplier') === 'on',
    tagIds: fd.getAll('tagIds').map(Number),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  return { ok: true, data: parsed.data };
}

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const positiveInt = (v: string | string[] | undefined) => {
  const n = Number(first(v));
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

// Query string ke ListQuery. Nilai yang tidak valid diabaikan satu per satu (bukan membatalkan semuanya).
export function parseListParams(sp: SearchParams): ListQuery {
  const kind = first(sp.kind);
  const role = first(sp.role);
  return listQuerySchema.parse({
    q: first(sp.q)?.trim() || undefined,
    kind: (CONTACT_KINDS as readonly string[]).includes(kind ?? '') ? kind : undefined,
    role: role === 'customer' || role === 'supplier' ? role : undefined,
    tagId: positiveInt(sp.tag),
    archived: first(sp.archived) === '1',
    page: positiveInt(sp.page) ?? 1,
  });
}

// ListQuery ke query string, untuk tautan paginasi. Nilai bawaan tidak ditulis.
export function listHref(query: ListQuery, overrides: Partial<ListQuery> = {}): string {
  const q = { ...query, ...overrides };
  const p = new URLSearchParams();
  if (q.q) p.set('q', q.q);
  if (q.kind) p.set('kind', q.kind);
  if (q.role) p.set('role', q.role);
  if (q.tagId) p.set('tag', String(q.tagId));
  if (q.archived) p.set('archived', '1');
  if (q.page > 1) p.set('page', String(q.page));
  const s = p.toString();
  return s ? `/dashboard/contacts?${s}` : '/dashboard/contacts';
}
