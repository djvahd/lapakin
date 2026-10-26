import {
  activityInputSchema,
  boardQuerySchema,
  moveInputSchema,
  opportunityInputSchema,
  type ActivityInput,
  type BoardQuery,
  type MoveInput,
  type OpportunityInput,
} from './schemas';

// Penerjemah antara FormData / query string dan skema Zod. Murni (tanpa database), jadi mudah dites.

export type FormResult<T> = { ok: true; data: T } | { ok: false; error: string };

const text = (fd: FormData, key: string) => {
  const v = fd.get(key);
  return typeof v === 'string' ? v : undefined;
};

const optionalId = (fd: FormData, key: string) => {
  const v = text(fd, key)?.trim();
  return v ? Number(v) : null;
};

// Nilai uang diketik apa adanya: angka dengan titik desimal opsional ("1500000" atau "1500000.50").
// Pemisah ribuan tidak diterima karena "1.500" ambigu (seribu lima ratus atau satu koma lima).
function parseMoney(raw: string | undefined): number | string {
  const v = (raw ?? '').trim();
  if (v === '') return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return Number.NaN;
  return Number(v);
}

const firstError = (issues: { message: string }[]) => issues[0]?.message ?? 'Invalid input';

export function parseOpportunityForm(fd: FormData): FormResult<OpportunityInput> {
  const money = parseMoney(text(fd, 'expectedValue'));
  if (Number.isNaN(money)) {
    return { ok: false, error: 'Enter the expected value as a plain number, for example 1500000 or 1500000.50' };
  }
  const parsed = opportunityInputSchema.safeParse({
    title: text(fd, 'title') ?? '',
    contactId: optionalId(fd, 'contactId'),
    stageId: optionalId(fd, 'stageId'),
    expectedValue: money,
    expectedCloseDate: text(fd, 'expectedCloseDate'),
    priority: Number(text(fd, 'priority') || 0),
    ownerId: optionalId(fd, 'ownerId'),
    notes: text(fd, 'notes'),
  });
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: firstError(parsed.error.issues) };
}

export function parseMoveForm(fd: FormData): FormResult<MoveInput> {
  const parsed = moveInputSchema.safeParse({
    stageId: Number(text(fd, 'stageId')),
    lostReason: text(fd, 'lostReason'),
  });
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: 'Choose a stage' };
}

export function parseActivityForm(fd: FormData): FormResult<ActivityInput> {
  const parsed = activityInputSchema.safeParse({
    opportunityId: Number(text(fd, 'opportunityId')),
    kind: text(fd, 'kind'),
    summary: text(fd, 'summary') ?? '',
    dueDate: text(fd, 'dueDate') ?? '',
    assignedTo: optionalId(fd, 'assignedTo'),
  });
  if (parsed.success) return { ok: true, data: parsed.data };
  const issue = parsed.error.issues[0];
  const field = issue?.path[0];
  if (field === 'dueDate') return { ok: false, error: 'Choose a due date' };
  if (field === 'opportunityId') return { ok: false, error: 'Opportunity not found' };
  return { ok: false, error: firstError(parsed.error.issues) };
}

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const positiveInt = (v: string | string[] | undefined) => {
  const n = Number(first(v));
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

// Query string papan: q, owner, archived. Nilai tidak valid diabaikan satu per satu.
export function parseBoardParams(sp: SearchParams): BoardQuery & { archived: boolean } {
  const base = boardQuerySchema.parse({
    q: first(sp.q)?.trim() || undefined,
    ownerId: positiveInt(sp.owner),
  });
  return { ...base, archived: first(sp.archived) === '1' };
}

export function boardHref(query: BoardQuery & { archived?: boolean }): string {
  const p = new URLSearchParams();
  if (query.q) p.set('q', query.q);
  if (query.ownerId) p.set('owner', String(query.ownerId));
  if (query.archived) p.set('archived', '1');
  const s = p.toString();
  return s ? `/dashboard/crm?${s}` : '/dashboard/crm';
}
