import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { withTenant } from '@/lib/db/tenant';
import { activityLogs } from '@/lib/db/schema';
import { contacts } from '@/modules/contacts/schema';
import { invoiceInputSchema, listQuerySchema, paymentInputSchema } from '@/modules/billing/schemas';
import {
  BillingError,
  createInvoice,
  getInvoice,
  getInvoiceableLines,
  issueInvoice,
  listInvoices,
  receivablesSummary,
  recordPayment,
  updateInvoice,
  voidInvoice,
  type Actor,
} from '@/modules/billing/service';
import { orderInputSchema } from '@/modules/sales/schemas';
import { confirmOrder, createOrder, getOrder } from '@/modules/sales/service';

// Tes integrasi terhadap database sungguhan (branch dev Neon), sebagai role lapakin_app.
const ownerUrl = process.env.MIGRATION_URL;
if (!ownerUrl) throw new Error('MIGRATION_URL belum diisi di .env');
const owner = neon(ownerUrl);

const tag = `bill-test-${Date.now()}`;
let u1 = 0;
let A: Actor;
let B: Actor;
let contactA = 0;
let contactB = 0;

const TODAY = '2026-11-10';
type L = Record<string, unknown>;
const line = (o: L = {}) => ({ description: 'Item', quantity: 10, unitPrice: 1000, ...o });
// Pesanan terkonfirmasi dengan baris default 10 x 1000 = 10.000.
const confirmed = async (lines: L[] = [line()], actor = A, contactId = contactA) => {
  const o = await createOrder(actor, orderInputSchema.parse({ contactId, issueDate: '2026-11-01', lines }));
  await confirmOrder(actor, o.id);
  return (await getOrder(actor.teamId, o.id))!;
};
const invoice = (lines: { orderLineId: number; quantity: number }[], o: L = {}) =>
  invoiceInputSchema.parse({ issueDate: '2026-11-01', dueDate: '2026-11-15', lines, ...o });
const pay = (amount: number, o: L = {}) => paymentInputSchema.parse({ amount, paidOn: '2026-11-05', ...o });
const full = (o: Awaited<ReturnType<typeof confirmed>>, o2: L = {}) =>
  invoice(o.lines.map((l) => ({ orderLineId: l.id, quantity: l.quantity })), o2);
const issued = async (o: Awaited<ReturnType<typeof confirmed>>, o2: L = {}) => {
  const inv = await createInvoice(A, o.id, full(o, o2));
  await issueInvoice(A, inv.id);
  return inv;
};
const expectCode = async (p: Promise<unknown>, code: string) => {
  const e = await p.then(
    () => null,
    (err) => err
  );
  expect(e).toBeInstanceOf(BillingError);
  expect((e as BillingError).code).toBe(code);
};

beforeAll(async () => {
  u1 = (await owner`insert into users (email, password_hash) values (${tag + '@test.local'}, 'x') returning id`)[0].id;
  const a = (await owner`insert into teams (name) values (${tag + '-a'}) returning id`)[0].id as number;
  const b = (await owner`insert into teams (name) values (${tag + '-b'}) returning id`)[0].id as number;
  A = { teamId: a, userId: u1 };
  B = { teamId: b, userId: u1 };
  const [[ca]] = await withTenant(a, [db.insert(contacts).values({ teamId: a, kind: 'person', name: 'Budi' }).returning()]);
  const [[cb]] = await withTenant(b, [db.insert(contacts).values({ teamId: b, kind: 'person', name: 'Sari' }).returning()]);
  contactA = ca.id;
  contactB = cb.id;
});

afterAll(async () => {
  const ids = [A.teamId, B.teamId];
  for (const t of ['activity_logs', 'bill_payments', 'bill_lines', 'bill_invoices', 'sales_lines', 'sales_orders', 'contacts']) {
    await owner.query(`delete from ${t} where team_id in (${ids[0]}, ${ids[1]})`);
  }
  await owner`delete from teams where id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from users where id = ${u1}`;
});

describe('validasi input', () => {
  it('menolak jatuh tempo sebelum tanggal terbit, baris ganda, dan pembayaran nol', () => {
    expect(invoiceInputSchema.safeParse({ issueDate: '2026-11-10', dueDate: '2026-11-01', lines: [{ orderLineId: 1, quantity: 1 }] }).success).toBe(false);
    expect(
      invoiceInputSchema.safeParse({ issueDate: '2026-11-01', dueDate: '2026-11-02', lines: [{ orderLineId: 1, quantity: 1 }, { orderLineId: 1, quantity: 1 }] }).success
    ).toBe(false);
    expect(paymentInputSchema.safeParse({ amount: 0, paidOn: '2026-11-05' }).success).toBe(false);
  });
});

describe('faktur', () => {
  it('dibuat dari pesanan terkonfirmasi: nomor urut per toko, salinan baris, total, audit', async () => {
    const o = await confirmed([line({ quantity: 2, unitPrice: 10000, discountPct: 10 }), line({ quantity: 1, unitPrice: 500 })]);
    const inv = await createInvoice(A, o.id, full(o));
    const ob = await confirmed([line()], B, contactB);
    const invB = await createInvoice(B, ob.id, full(ob));
    expect([inv.number, invB.number]).toEqual([expect.any(Number), 1]);
    expect(inv.status).toBe('draft');

    const d = await getInvoice(A.teamId, inv.id, TODAY);
    expect(d?.lines.map((l) => l.total)).toEqual([18000, 500]);
    expect(d).toMatchObject({ total: 18500, paid: 0, balance: 18500, paymentStatus: 'unpaid', contactName: 'Budi' });

    const [logs] = await withTenant(A.teamId, [
      db.select().from(activityLogs).where(and(eq(activityLogs.teamId, A.teamId), eq(activityLogs.entityId, inv.id), eq(activityLogs.entityType, 'bill_invoice'))),
    ]);
    expect(logs.map((l) => l.action)).toEqual(['BILLING_INVOICE_CREATED']);
  });

  it('hanya untuk pesanan terkonfirmasi dan milik toko sendiri', async () => {
    const o = await createOrder(A, orderInputSchema.parse({ contactId: contactA, issueDate: '2026-11-01', lines: [line()] }));
    const d = (await getOrder(A.teamId, o.id))!;
    await expectCode(createInvoice(A, o.id, invoice([{ orderLineId: d.lines[0].id, quantity: 1 }])), 'invalid_order');
    const ob = await confirmed([line()], B, contactB);
    await expectCode(createInvoice(A, ob.id, full(ob)), 'invalid_order');
  });

  it('boleh menagih sebagian, tetapi total tagihan per baris tidak melebihi pesanan', async () => {
    const o = await confirmed();
    const lineId = o.lines[0].id;
    await createInvoice(A, o.id, invoice([{ orderLineId: lineId, quantity: 6 }]));
    await expectCode(createInvoice(A, o.id, invoice([{ orderLineId: lineId, quantity: 5 }])), 'over_invoiced');
    await createInvoice(A, o.id, invoice([{ orderLineId: lineId, quantity: 4 }]));
    expect((await getInvoiceableLines(A.teamId, o.id))?.lines[0].remaining).toBe(0);
  });

  it('faktur batal membebaskan jumlahnya untuk ditagih lagi', async () => {
    const o = await confirmed();
    const inv = await createInvoice(A, o.id, full(o));
    await voidInvoice(A, inv.id);
    expect((await getInvoiceableLines(A.teamId, o.id))?.lines[0].remaining).toBe(10);
    await createInvoice(A, o.id, full(o));
  });

  it('draft bisa diubah dan baris diganti; faktur terbit terkunci', async () => {
    const o = await confirmed();
    const lineId = o.lines[0].id;
    const inv = await createInvoice(A, o.id, invoice([{ orderLineId: lineId, quantity: 3 }]));
    await updateInvoice(A, inv.id, invoice([{ orderLineId: lineId, quantity: 10 }], { dueDate: '2026-12-01' }));
    expect(await getInvoice(A.teamId, inv.id)).toMatchObject({ total: 10000, dueDate: '2026-12-01' });
    await issueInvoice(A, inv.id);
    await expectCode(updateInvoice(A, inv.id, invoice([{ orderLineId: lineId, quantity: 1 }])), 'invalid_status');
    await expectCode(issueInvoice(A, inv.id), 'invalid_status');
  });

  it('tidak terlihat atau bisa diubah dari toko lain', async () => {
    const o = await confirmed();
    const inv = await createInvoice(A, o.id, full(o));
    expect(await getInvoice(B.teamId, inv.id)).toBeNull();
    await expectCode(issueInvoice(B, inv.id), 'not_found');
    expect((await listInvoices(B.teamId, listQuerySchema.parse({ today: TODAY }))).items.every((i) => i.teamId === B.teamId)).toBe(true);
  });
});

describe('pembayaran dan piutang', () => {
  it('hanya untuk faktur terbit; sebagian lalu lunas; tidak boleh melebihi sisa', async () => {
    const o = await confirmed();
    const inv = await createInvoice(A, o.id, full(o));
    await expectCode(recordPayment(A, inv.id, pay(1000)), 'invalid_status');
    await issueInvoice(A, inv.id);

    await recordPayment(A, inv.id, pay(4000, { method: 'cash', note: 'DP' }));
    expect(await getInvoice(A.teamId, inv.id, TODAY)).toMatchObject({ paid: 4000, balance: 6000, paymentStatus: 'partial' });
    await expectCode(recordPayment(A, inv.id, pay(6000.01)), 'overpayment');

    await recordPayment(A, inv.id, pay(6000));
    expect(await getInvoice(A.teamId, inv.id, TODAY)).toMatchObject({ paid: 10000, balance: 0, paymentStatus: 'paid', overdue: false });
    await expectCode(recordPayment(A, inv.id, pay(1)), 'overpayment');
  });

  it('faktur dengan pembayaran tidak bisa dibatalkan', async () => {
    const o = await confirmed();
    const inv = await issued(o);
    await recordPayment(A, inv.id, pay(100));
    await expectCode(voidInvoice(A, inv.id), 'has_payments');
  });

  it('dua pembayaran bersamaan tidak melebihi sisa tagihan', async () => {
    const o = await confirmed();
    const inv = await issued(o);
    const results = await Promise.allSettled([recordPayment(A, inv.id, pay(7000)), recordPayment(A, inv.id, pay(7000))]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await getInvoice(A.teamId, inv.id))?.paid).toBe(7000);
  });

  it('pembayaran tidak bisa diubah atau dihapus oleh aplikasi', async () => {
    const o = await confirmed();
    const inv = await issued(o);
    const p = await recordPayment(A, inv.id, pay(100));
    await expect(withTenant(A.teamId, [db.execute(sql`delete from bill_payments where id = ${p.id}`)])).rejects.toThrow();
  });

  it('daftar menyaring status bayar dan jatuh tempo; ringkasan piutang menjumlahkan sisa', async () => {
    const mk = async (dueDate: string, payAmount: number) => {
      const o = await confirmed();
      const inv = await issued(o, { dueDate });
      if (payAmount) await recordPayment(A, inv.id, pay(payAmount));
      return inv.id;
    };
    const overdueId = await mk('2026-11-05', 2000); // lewat tempo, sisa 8000
    const futureId = await mk('2026-12-31', 0); // belum tempo, sisa 10000
    const paidId = await mk('2026-11-05', 10000); // lunas

    const ids = async (payment: string) =>
      (await listInvoices(A.teamId, listQuerySchema.parse({ payment, today: TODAY, pageSize: 100 }))).items.map((i) => i.id);
    expect(await ids('overdue')).toContain(overdueId);
    expect(await ids('overdue')).not.toContain(futureId);
    expect(await ids('overdue')).not.toContain(paidId);
    expect(await ids('paid')).toContain(paidId);
    expect(await ids('partial')).toContain(overdueId);
    expect(await ids('unpaid')).toContain(futureId);
    const open = await ids('open');
    expect(open).toEqual(expect.arrayContaining([overdueId, futureId]));
    expect(open).not.toContain(paidId);
    // Tagihan terbuka berurutan dari jatuh tempo terdekat.
    expect(open.indexOf(overdueId)).toBeLessThan(open.indexOf(futureId));

    const open1 = (await listInvoices(A.teamId, listQuerySchema.parse({ payment: 'overdue', today: TODAY, pageSize: 100 }))).items.find((i) => i.id === overdueId);
    expect(open1).toMatchObject({ overdue: true, balance: 8000, paymentStatus: 'partial' });

    const s = await receivablesSummary(A.teamId, TODAY);
    expect(s.outstanding).toBeGreaterThanOrEqual(18000);
    expect(s.overdue).toBeGreaterThanOrEqual(8000);
    expect(s.overdue).toBeLessThan(s.outstanding);
  });
});
