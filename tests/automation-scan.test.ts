import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { db } from '@/lib/db/drizzle';
import { withTenant } from '@/lib/db/tenant';
import { contacts } from '@/modules/contacts/schema';
import { invoiceInputSchema, paymentInputSchema } from '@/modules/billing/schemas';
import { createInvoice, issueInvoice, recordPayment } from '@/modules/billing/service';
import { activityInputSchema, opportunityInputSchema } from '@/modules/crm/schemas';
import { createActivity, createOpportunity } from '@/modules/crm/service';
import { ruleInputSchema } from '@/modules/automation/schemas';
import { createRule, listNotifications, listRuns, type Actor } from '@/modules/automation/service';
import { scanTeam } from '@/modules/automation/scan';
import { todayIn } from '@/modules/crm/format';
import { orderInputSchema } from '@/modules/sales/schemas';
import { confirmOrder, createOrder, getOrder } from '@/modules/sales/service';
import { POST } from '@/app/api/cron/automation/route';

// Tes integrasi terhadap database sungguhan (branch dev Neon), sebagai role lapakin_app.
const ownerUrl = process.env.MIGRATION_URL;
if (!ownerUrl) throw new Error('MIGRATION_URL belum diisi di .env');
const owner = neon(ownerUrl);

const tag = `scan-test-${Date.now()}`;
let u1 = 0;
let u2 = 0;
let A: Actor;
let contactA = 0;

const rule = (o: Record<string, unknown>) => ruleInputSchema.parse(o);
const overdueInvoice = async (dueDate: string, paid = 0) => {
  const o0 = await createOrder(A, orderInputSchema.parse({ contactId: contactA, issueDate: '2026-09-01', lines: [{ description: 'Item', quantity: 1, unitPrice: 10000 }] }));
  await confirmOrder(A, o0.id);
  const o = (await getOrder(A.teamId, o0.id))!;
  const inv = await createInvoice(A, o.id, invoiceInputSchema.parse({ issueDate: '2026-09-01', dueDate, lines: [{ orderLineId: o.lines[0].id, quantity: 1 }] }));
  await issueInvoice(A, inv.id);
  if (paid) await recordPayment(A, inv.id, paymentInputSchema.parse({ amount: paid, paidOn: '2026-09-02' }));
  return inv;
};

beforeAll(async () => {
  u1 = (await owner`insert into users (email, password_hash) values (${tag + '-1@test.local'}, 'x') returning id`)[0].id;
  u2 = (await owner`insert into users (email, password_hash) values (${tag + '-2@test.local'}, 'x') returning id`)[0].id;
  const a = (await owner`insert into teams (name) values (${tag + '-a'}) returning id`)[0].id as number;
  A = { teamId: a, userId: u1 };
  await owner`insert into team_members (user_id, team_id, role) values (${u1}, ${a}, 'owner'), (${u2}, ${a}, 'member')`;
  await owner`update teams set plan_name = 'pro', subscription_status = 'active', plan_expires_at = now() + interval '1 month' where id = ${a}`;
  const [[c]] = await withTenant(a, [db.insert(contacts).values({ teamId: a, kind: 'person', name: 'Budi' }).returning()]);
  contactA = c.id;
});

afterAll(async () => {
  const id = A.teamId;
  for (const t of [
    'activity_logs', 'auto_notifications', 'auto_runs', 'auto_rules', 'bill_payments', 'bill_lines', 'bill_invoices',
    'sales_lines', 'sales_orders', 'crm_activities', 'crm_opportunities', 'crm_stages', 'contacts', 'team_members',
  ]) {
    await owner.query(`delete from ${t} where team_id = ${id}`);
  }
  await owner`delete from teams where id = ${id}`;
  await owner`delete from users where id in (${u1}, ${u2})`;
});

describe('pemindai faktur jatuh tempo', () => {
  it('mengirim pengingat dengan data faktur, sekali per minggu, dan melewati yang lunas atau belum jatuh tempo', async () => {
    const r = await createRule(
      A,
      rule({
        name: 'Tagih',
        event: 'invoice.overdue',
        conditions: [{ field: 'daysOverdue', op: 'gte', value: 1 }],
        action: 'notify',
        actionConfig: { title: 'Faktur {{number}} lewat {{daysOverdue}} hari', body: '{{contact}} belum membayar {{balance}}', link: '/dashboard/invoices/{{invoiceId}}' },
      })
    );
    const late = await overdueInvoice('2026-10-01', 4000);
    const settled = await overdueInvoice('2026-10-01', 10000);
    await overdueInvoice('2026-12-31');

    // 40 hari lewat tempo (minggu ke-5).
    await scanTeam(A.teamId, '2026-11-10');
    const notes = (await listNotifications(A.teamId, u1, { limit: 100 })).filter((n) => n.ruleId === r.id);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ title: expect.stringMatching(/lewat 40 hari$/), body: 'Budi belum membayar 6000', link: `/dashboard/invoices/${late.id}` });
    expect(notes[0].link).not.toContain(String(settled.id));

    // Hari yang sama dan sehari kemudian (41 hari, masih minggu ke-5): tidak diulang.
    await scanTeam(A.teamId, '2026-11-10');
    await scanTeam(A.teamId, '2026-11-11');
    expect(await listRuns(A.teamId, { ruleId: r.id })).toHaveLength(1);

    // Pada hari ke-47 (minggu ke-6): satu pengingat lagi.
    await scanTeam(A.teamId, '2026-11-17');
    expect(await listRuns(A.teamId, { ruleId: r.id })).toHaveLength(2);
  });

  it('toko tanpa aturan aktif tidak menghasilkan apa-apa', async () => {
    const res = await scanTeam(A.teamId + 999_999, '2026-11-10');
    expect(res).toEqual({ emitted: 0, failed: 0 });
  });
});

describe('pemindai tindak lanjut CRM', () => {
  it('memberi tahu penanggung jawab untuk tindak lanjut yang lewat tanggal', async () => {
    const r = await createRule(
      A,
      rule({
        name: 'Follow-up',
        event: 'crm.followup_overdue',
        action: 'notify',
        actionConfig: { title: 'Tindak lanjut terlambat: {{summary}}', body: '{{opportunity}}, {{daysOverdue}} hari', link: '/dashboard/crm/{{opportunityId}}', recipient: 'payload_user' },
      })
    );
    const opp = await createOpportunity(A, opportunityInputSchema.parse({ title: 'Proyek kopi', contactId: contactA }));
    await createActivity(A, activityInputSchema.parse({ opportunityId: opp.id, kind: 'call', summary: 'Telepon Budi', dueDate: '2026-11-05', assignedTo: u2 }));
    await createActivity(A, activityInputSchema.parse({ opportunityId: opp.id, kind: 'todo', summary: 'Belum waktunya', dueDate: '2026-12-01', assignedTo: u2 }));

    await scanTeam(A.teamId, '2026-11-10');
    const mine = (await listNotifications(A.teamId, u2, { limit: 100 })).filter((n) => n.ruleId === r.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ title: 'Tindak lanjut terlambat: Telepon Budi', body: 'Proyek kopi, 5 hari', link: `/dashboard/crm/${opp.id}` });
    // Owner (u1) bukan penerima pada aturan ini.
    expect((await listNotifications(A.teamId, u1, { limit: 100 })).some((n) => n.ruleId === r.id)).toBe(false);
  });
});

describe('pemindai langganan', () => {
  it('mengingatkan sekali per masa berlaku saat paket Pro mendekati akhir', async () => {
    const r = await createRule(
      A,
      rule({
        name: 'Perpanjang',
        event: 'subscription.expiring',
        conditions: [{ field: 'daysLeft', op: 'lte', value: 3 }],
        action: 'notify',
        actionConfig: { title: 'Paket {{plan}} berakhir {{expiresOn}} ({{daysLeft}} hari lagi)', link: '/pricing' },
      })
    );
    // Tanggal "hari ini" harus zona WIB seperti cron produksi; tanggal UTC meleset sehari antara 17:00 dan 24:00 UTC.
    const today = todayIn();

    // Masih lama (10 hari): tidak cocok dengan kondisi daysLeft <= 3.
    await owner`update teams set plan_expires_at = now() + interval '10 days' where id = ${A.teamId}`;
    await scanTeam(A.teamId, today);
    expect(await listRuns(A.teamId, { ruleId: r.id })).toHaveLength(0);

    // Dua hari lagi: satu pengingat; pemindaian ulang tidak menggandakannya.
    await owner`update teams set plan_expires_at = now() + interval '2 days' where id = ${A.teamId}`;
    await scanTeam(A.teamId, today);
    await scanTeam(A.teamId, today);
    const runs = await listRuns(A.teamId, { ruleId: r.id });
    expect(runs).toHaveLength(1);
    const mine = (await listNotifications(A.teamId, u1, { limit: 100 })).filter((n) => n.ruleId === r.id);
    expect(mine).toHaveLength(1);
    expect(mine[0].title).toMatch(/^Paket pro berakhir \d{4}-\d{2}-\d{2} \([123] hari lagi\)$/);
    expect(mine[0].link).toBe('/pricing');

    // Setelah diperpanjang (tanggal berakhir baru), pengingat berikutnya boleh muncul lagi.
    await owner`update teams set plan_expires_at = now() + interval '1 month 2 days' where id = ${A.teamId}`;
    await owner`update teams set plan_expires_at = now() + interval '3 days' where id = ${A.teamId}`;
    await scanTeam(A.teamId, today);
    expect(await listRuns(A.teamId, { ruleId: r.id })).toHaveLength(2);
    await owner`update teams set plan_expires_at = now() + interval '1 month' where id = ${A.teamId}`;
  });
});

describe('endpoint cron', () => {
  const call = (auth?: string) =>
    POST(new Request('http://localhost/api/cron/automation', { method: 'POST', headers: auth ? { authorization: auth } : {} }));

  it('menolak bila rahasia belum dipasang, salah, atau tidak ada', async () => {
    const prev = process.env.CRON_SECRET;
    try {
      delete process.env.CRON_SECRET;
      expect((await call('Bearer apa-saja')).status).toBe(503);
      process.env.CRON_SECRET = 'rahasia-tes';
      expect((await call()).status).toBe(401);
      expect((await call('Bearer salah')).status).toBe(401);
      expect((await call('rahasia-tes')).status).toBe(401);
    } finally {
      if (prev === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = prev;
    }
  });
});
