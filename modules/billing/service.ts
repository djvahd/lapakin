import { and, asc, count, desc, eq, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { withTenant } from '@/lib/db/tenant';
import { auditEntry } from '@/lib/audit';
import { getContactNames } from '@/modules/contacts/service';
import { getOrder } from '@/modules/sales/service';
import { billInvoices, billLines, billPayments, type BillInvoice, type BillLine, type BillPayment } from './schema';
import type { InvoiceInput, ListQuery, PaymentInput } from './schemas';

// Layanan faktur dan pembayaran. Faktur dibuat dari pesanan terkonfirmasi (Sales) dan menyalin
// barisnya. Sisa tagihan = total baris - jumlah pembayaran; keduanya dihitung dari tabel, tidak
// disimpan sebagai angka. Semua query memfilter team_id (lapis 1) dan berjalan lewat withTenant (RLS).

export type Actor = { teamId: number; userId: number };

export type BillingErrorCode =
  | 'not_found'
  | 'invalid_order'
  | 'invalid_status'
  | 'invalid_line'
  | 'over_invoiced'
  | 'overpayment'
  | 'has_payments'
  | 'number_conflict';

const DEFAULT_MESSAGES: Record<BillingErrorCode, string> = {
  not_found: 'Invoice not found',
  invalid_order: 'Only a confirmed order can be invoiced',
  invalid_status: 'This action is not allowed in the current status',
  invalid_line: 'Line not found on this order',
  over_invoiced: 'Cannot invoice more than was ordered',
  overpayment: 'The payment is larger than the remaining balance',
  has_payments: 'An invoice with payments cannot be voided',
  number_conflict: 'Could not allocate an invoice number, try again',
};

export class BillingError extends Error {
  constructor(
    public code: BillingErrorCode,
    message?: string
  ) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = 'BillingError';
  }
}

const sqlState = (e: unknown): string | undefined =>
  (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export const lineTotal = (l: Pick<BillLine, 'quantity' | 'unitPrice' | 'discountPct'>) =>
  round2(l.quantity * l.unitPrice * (1 - l.discountPct / 100));

// Total dan jumlah terbayar sebagai subquery berkorelasi pada baris bill_invoices.
const totalSql = sql`coalesce((select sum(round(l.quantity * l.unit_price * (1 - l.discount_pct / 100), 2))
  from bill_lines l where l.invoice_id = bill_invoices.id and l.team_id = bill_invoices.team_id), 0)`;
const paidSql = sql`coalesce((select sum(p.amount) from bill_payments p
  where p.invoice_id = bill_invoices.id and p.team_id = bill_invoices.team_id), 0)`;

export type PaymentStatus = 'unpaid' | 'partial' | 'paid';

export const paymentStatus = (total: number, paid: number): PaymentStatus =>
  paid >= total ? 'paid' : paid > 0 ? 'partial' : 'unpaid';

export const isOverdue = (inv: { status: string; dueDate: string }, balance: number, today: string) =>
  inv.status === 'issued' && balance > 0 && inv.dueDate < today;

// ---------------------------------------------------------------------------
// Pencarian
// ---------------------------------------------------------------------------

async function findInvoice(teamId: number, id: number): Promise<BillInvoice | null> {
  const [rows] = await withTenant(teamId, [
    db
      .select()
      .from(billInvoices)
      .where(and(eq(billInvoices.id, id), eq(billInvoices.teamId, teamId)))
      .limit(1),
  ]);
  return rows[0] ?? null;
}

async function requireInvoice(teamId: number, id: number) {
  const inv = await findInvoice(teamId, id);
  if (!inv) throw new BillingError('not_found');
  return inv;
}

// Jumlah yang sudah ditagih per baris pesanan, tidak menghitung faktur batal. `exceptInvoiceId`
// dipakai saat mengubah draft agar tagihannya sendiri tidak terhitung dua kali.
async function invoicedByLine(teamId: number, orderId: number, exceptInvoiceId?: number): Promise<Map<number, number>> {
  const [rows] = await withTenant(teamId, [
    db
      .select({
        lineId: billLines.orderLineId,
        total: sql<number>`coalesce(sum(${billLines.quantity}), 0)::float8`,
      })
      .from(billLines)
      .innerJoin(billInvoices, and(eq(billInvoices.id, billLines.invoiceId), eq(billInvoices.teamId, billLines.teamId)))
      .where(
        and(
          eq(billInvoices.orderId, orderId),
          eq(billInvoices.teamId, teamId),
          sql`${billInvoices.status} <> 'void'`,
          exceptInvoiceId ? sql`${billInvoices.id} <> ${exceptInvoiceId}` : undefined
        )
      )
      .groupBy(billLines.orderLineId),
  ]);
  return new Map(rows.map((r) => [r.lineId, r.total]));
}

// Baris faktur dari baris pesanan; menolak baris asing dan jumlah di atas sisa yang belum ditagih.
async function buildLines(teamId: number, orderId: number, input: InvoiceInput, exceptInvoiceId?: number) {
  const order = await getOrder(teamId, orderId);
  if (!order || order.status !== 'confirmed') throw new BillingError('invalid_order');
  const invoiced = await invoicedByLine(teamId, orderId, exceptInvoiceId);
  const byId = new Map(order.lines.map((l) => [l.id, l]));

  const rows = input.lines.map((l, i) => {
    const src = byId.get(l.orderLineId);
    if (!src) throw new BillingError('invalid_line');
    if (l.quantity > round3(src.quantity - (invoiced.get(src.id) ?? 0))) throw new BillingError('over_invoiced');
    return {
      teamId,
      orderLineId: src.id,
      description: src.description,
      position: i + 1,
      quantity: l.quantity,
      unitPrice: src.unitPrice,
      discountPct: src.discountPct,
    };
  });
  return { order, rows };
}

// ---------------------------------------------------------------------------
// Faktur
// ---------------------------------------------------------------------------

// Setelah faktur dan barisnya tersimpan, hitung ulang: dua faktur bersamaan bisa sama-sama lolos
// pemeriksaan awal. Kunci baris pesanan membuat penyisipan berurutan; yang melebihi dibatalkan.
async function overInvoiced(teamId: number, orderId: number): Promise<boolean> {
  const order = await getOrder(teamId, orderId);
  if (!order) return false;
  const invoiced = await invoicedByLine(teamId, orderId);
  return order.lines.some((l) => (invoiced.get(l.id) ?? 0) > l.quantity + 1e-9);
}

export async function createInvoice(actor: Actor, orderId: number, input: InvoiceInput): Promise<BillInvoice> {
  const { teamId, userId } = actor;
  const { order, rows } = await buildLines(teamId, orderId, input);

  let created: BillInvoice | undefined;
  for (let attempt = 0; attempt < 5 && !created; attempt++) {
    try {
      const [[row]] = await withTenant(teamId, [
        db
          .insert(billInvoices)
          .values({
            teamId,
            number: sql`(select coalesce(max(number), 0) + 1 from bill_invoices where team_id = ${teamId}::int)`,
            orderId,
            contactId: order.contactId,
            issueDate: input.issueDate,
            dueDate: input.dueDate,
            notes: input.notes,
            createdBy: userId,
          })
          .returning(),
      ]);
      created = row;
    } catch (e) {
      if (sqlState(e) !== '23505') throw e;
    }
  }
  if (!created) throw new BillingError('number_conflict');

  const remove = () =>
    withTenant(teamId, [db.delete(billInvoices).where(and(eq(billInvoices.id, created!.id), eq(billInvoices.teamId, teamId)))]);

  try {
    await withTenant(teamId, [
      db.select({ id: billInvoices.id }).from(billInvoices).where(and(eq(billInvoices.orderId, orderId), eq(billInvoices.teamId, teamId))).for('update'),
      db.insert(billLines).values(rows.map((r) => ({ ...r, invoiceId: created!.id }))),
      auditEntry(teamId, userId, 'BILLING_INVOICE_CREATED', {
        entityType: 'bill_invoice',
        entityId: created.id,
        metadata: { number: created.number },
      }),
    ]);
  } catch (e) {
    await remove();
    throw e;
  }
  if (await overInvoiced(teamId, orderId)) {
    await remove();
    throw new BillingError('over_invoiced');
  }
  return created;
}

// Hanya draft yang bisa diubah; tanggal, catatan, dan semua baris diganti dalam satu transaksi.
export async function updateInvoice(actor: Actor, id: number, input: InvoiceInput): Promise<BillInvoice> {
  const { teamId, userId } = actor;
  const existing = await requireInvoice(teamId, id);
  if (existing.status !== 'draft') throw new BillingError('invalid_status');
  const { rows } = await buildLines(teamId, existing.orderId, input, id);

  const results = await withTenant(teamId, [
    db
      .update(billInvoices)
      .set({ issueDate: input.issueDate, dueDate: input.dueDate, notes: input.notes, updatedAt: new Date() })
      .where(and(eq(billInvoices.id, id), eq(billInvoices.teamId, teamId), eq(billInvoices.status, 'draft')))
      .returning(),
    db.delete(billLines).where(and(eq(billLines.invoiceId, id), eq(billLines.teamId, teamId))),
    db.insert(billLines).values(rows.map((r) => ({ ...r, invoiceId: id }))),
    auditEntry(teamId, userId, 'BILLING_INVOICE_UPDATED', {
      entityType: 'bill_invoice',
      entityId: id,
      metadata: { number: existing.number },
    }),
  ]);
  if (!results[0][0]) throw new BillingError('invalid_status');
  return results[0][0];
}

async function transition(
  actor: Actor,
  id: number,
  from: BillInvoice['status'][],
  to: BillInvoice['status'],
  action: string,
  extra: Partial<typeof billInvoices.$inferInsert> = {},
  guard?: SQL
): Promise<BillInvoice> {
  const { teamId, userId } = actor;
  const existing = await requireInvoice(teamId, id);
  if (!from.includes(existing.status as BillInvoice['status'])) throw new BillingError('invalid_status');

  const [rows] = await withTenant(teamId, [
    db
      .update(billInvoices)
      .set({ status: to, updatedAt: new Date(), ...extra })
      .where(
        and(
          eq(billInvoices.id, id),
          eq(billInvoices.teamId, teamId),
          sql`${billInvoices.status} in (${sql.join(from.map((f) => sql`${f}`), sql`, `)})`,
          guard
        )
      )
      .returning(),
  ]);
  if (rows.length === 0) throw new BillingError(guard ? 'has_payments' : 'invalid_status');
  await withTenant(teamId, [
    auditEntry(teamId, userId, action, { entityType: 'bill_invoice', entityId: id, metadata: { number: existing.number } }),
  ]);
  return rows[0];
}

export const issueInvoice = (a: Actor, id: number) =>
  transition(a, id, ['draft'], 'issued', 'BILLING_INVOICE_ISSUED', { issuedAt: new Date() });

// Faktur yang sudah menerima pembayaran tidak bisa dibatalkan.
export const voidInvoice = (a: Actor, id: number) =>
  transition(
    a,
    id,
    ['draft', 'issued'],
    'void',
    'BILLING_INVOICE_VOIDED',
    {},
    sql`not exists (select 1 from bill_payments p where p.invoice_id = bill_invoices.id and p.team_id = bill_invoices.team_id)`
  );

// ---------------------------------------------------------------------------
// Pembayaran
// ---------------------------------------------------------------------------

// Pembayaran disisipkan bersyarat setelah mengunci baris faktur, sehingga dua pembayaran bersamaan
// tidak bisa melebihi sisa tagihan.
export async function recordPayment(actor: Actor, invoiceId: number, input: PaymentInput): Promise<BillPayment> {
  const { teamId, userId } = actor;
  const inv = await requireInvoice(teamId, invoiceId);
  if (inv.status !== 'issued') throw new BillingError('invalid_status');

  const results = await withTenant(teamId, [
    db.select({ id: billInvoices.id }).from(billInvoices).where(and(eq(billInvoices.id, invoiceId), eq(billInvoices.teamId, teamId))).for('update'),
    db.execute(sql`
      insert into bill_payments (team_id, invoice_id, amount, paid_on, method, note, created_by)
      select ${teamId}::int, ${invoiceId}::int, ${input.amount}::numeric, ${input.paidOn}::date, ${input.method}::text, ${input.note}::text, ${userId}::int
      where (select status from bill_invoices where id = ${invoiceId}::int and team_id = ${teamId}::int) = 'issued'
        and (select coalesce(sum(round(l.quantity * l.unit_price * (1 - l.discount_pct / 100), 2)), 0)
               from bill_lines l where l.invoice_id = ${invoiceId}::int and l.team_id = ${teamId}::int)
          - (select coalesce(sum(p.amount), 0) from bill_payments p where p.invoice_id = ${invoiceId}::int and p.team_id = ${teamId}::int)
          >= ${input.amount}::numeric
      returning id
    `),
  ]);
  const inserted = (results[1] as unknown as { rows: { id: number }[] }).rows;
  if (inserted.length === 0) {
    const detail = await getInvoice(teamId, invoiceId, input.paidOn);
    throw new BillingError(
      detail && detail.status === 'issued' ? 'overpayment' : 'invalid_status',
      detail && detail.status === 'issued' ? `The payment is larger than the remaining balance (${detail.balance})` : undefined
    );
  }

  const [[payment]] = await withTenant(teamId, [
    db.select().from(billPayments).where(and(eq(billPayments.id, inserted[0].id), eq(billPayments.teamId, teamId))),
  ]);
  await withTenant(teamId, [
    auditEntry(teamId, userId, 'BILLING_PAYMENT_RECORDED', {
      entityType: 'bill_invoice',
      entityId: invoiceId,
      metadata: { number: inv.number, amount: input.amount },
    }),
  ]);
  return payment;
}

// ---------------------------------------------------------------------------
// Baca
// ---------------------------------------------------------------------------

export type InvoiceListItem = BillInvoice & {
  contactName: string | null;
  total: number;
  paid: number;
  balance: number;
  paymentStatus: PaymentStatus;
  overdue: boolean;
};

function paymentCondition(filter: ListQuery['payment'], today: string): SQL | undefined {
  switch (filter) {
    case 'unpaid':
      return sql`${billInvoices.status} = 'issued' and ${paidSql} = 0 and ${totalSql} > 0`;
    case 'partial':
      return sql`${billInvoices.status} = 'issued' and ${paidSql} > 0 and ${paidSql} < ${totalSql}`;
    case 'paid':
      return sql`${billInvoices.status} = 'issued' and ${paidSql} >= ${totalSql}`;
    case 'open':
      return sql`${billInvoices.status} = 'issued' and ${paidSql} < ${totalSql}`;
    case 'overdue':
      return sql`${billInvoices.status} = 'issued' and ${paidSql} < ${totalSql} and ${billInvoices.dueDate} < ${today}::date`;
    default:
      return undefined;
  }
}

export async function listInvoices(teamId: number, query: ListQuery) {
  const where = and(
    eq(billInvoices.teamId, teamId),
    query.status ? eq(billInvoices.status, query.status) : undefined,
    query.contactId ? eq(billInvoices.contactId, query.contactId) : undefined,
    query.orderId ? eq(billInvoices.orderId, query.orderId) : undefined,
    paymentCondition(query.payment, query.today)
  );
  // Tagihan terbuka diurutkan dari yang paling dulu jatuh tempo.
  const order = query.payment === 'open' || query.payment === 'overdue'
    ? [asc(billInvoices.dueDate), asc(billInvoices.number)]
    : [desc(billInvoices.number)];

  const [rows, totals] = await withTenant(teamId, [
    db
      .select({
        invoice: billInvoices,
        total: sql<number>`${totalSql}::float8`,
        paid: sql<number>`${paidSql}::float8`,
      })
      .from(billInvoices)
      .where(where)
      .orderBy(...order)
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ n: count() }).from(billInvoices).where(where),
  ]);
  const names = await getContactNames(teamId, rows.map((r) => r.invoice.contactId));
  const items: InvoiceListItem[] = rows.map((r) => {
    const balance = round2(r.total - r.paid);
    return {
      ...r.invoice,
      contactName: names.get(r.invoice.contactId)?.name ?? null,
      total: r.total,
      paid: r.paid,
      balance,
      paymentStatus: paymentStatus(r.total, r.paid),
      overdue: isOverdue(r.invoice, balance, query.today),
    };
  });
  return { items, total: totals[0].n, page: query.page, pageSize: query.pageSize };
}

// Ringkasan piutang: sisa tagihan faktur terbit, dan bagian yang sudah lewat jatuh tempo.
export async function receivablesSummary(teamId: number, today: string) {
  const [[row]] = await withTenant(teamId, [
    db
      .select({
        outstanding: sql<number>`coalesce(sum(${totalSql} - ${paidSql}), 0)::float8`,
        overdue: sql<number>`coalesce(sum(case when ${billInvoices.dueDate} < ${today}::date then ${totalSql} - ${paidSql} else 0 end), 0)::float8`,
        count: sql<number>`count(*)::int`,
      })
      .from(billInvoices)
      .where(and(eq(billInvoices.teamId, teamId), eq(billInvoices.status, 'issued'), sql`${paidSql} < ${totalSql}`)),
  ]);
  return { outstanding: round2(row.outstanding), overdue: round2(row.overdue), count: row.count };
}

export async function getInvoice(teamId: number, id: number, today = new Date().toISOString().slice(0, 10)) {
  const invoice = await findInvoice(teamId, id);
  if (!invoice) return null;

  const [[lines, payments], names, order] = await Promise.all([
    withTenant(teamId, [
      db.select().from(billLines).where(and(eq(billLines.invoiceId, id), eq(billLines.teamId, teamId))).orderBy(asc(billLines.position)),
      db.select().from(billPayments).where(and(eq(billPayments.invoiceId, id), eq(billPayments.teamId, teamId))).orderBy(desc(billPayments.id)),
    ]),
    getContactNames(teamId, [invoice.contactId]),
    getOrder(teamId, invoice.orderId),
  ]);
  const detailed = lines.map((l) => ({ ...l, total: lineTotal(l) }));
  const total = round2(detailed.reduce((s, l) => s + l.total, 0));
  const paid = round2(payments.reduce((s, p) => s + p.amount, 0));
  const balance = round2(total - paid);
  return {
    ...invoice,
    contactName: names.get(invoice.contactId)?.name ?? null,
    orderNumber: order?.number ?? null,
    lines: detailed,
    payments,
    total,
    paid,
    balance,
    paymentStatus: paymentStatus(total, paid),
    overdue: isOverdue(invoice, balance, today),
  };
}

// Sisa yang belum ditagih per baris pesanan terkonfirmasi, untuk mengisi form faktur baru.
export async function getInvoiceableLines(teamId: number, orderId: number) {
  const order = await getOrder(teamId, orderId);
  if (!order || order.status !== 'confirmed') return null;
  const invoiced = await invoicedByLine(teamId, orderId);
  return {
    order,
    lines: order.lines.map((l) => ({
      id: l.id,
      description: l.description,
      ordered: l.quantity,
      invoiced: invoiced.get(l.id) ?? 0,
      remaining: round3(l.quantity - (invoiced.get(l.id) ?? 0)),
      unitPrice: l.unitPrice,
      discountPct: l.discountPct,
    })),
  };
}
