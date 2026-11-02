import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { withTenant } from '@/lib/db/tenant';
import { activityLogs } from '@/lib/db/schema';
import { ruleInputSchema } from '@/modules/automation/schemas';
import {
  AutomationError,
  countUnread,
  createRule,
  deleteRule,
  emit,
  getRule,
  listNotifications,
  listRuns,
  listRules,
  markRead,
  setRuleActive,
  updateRule,
  type Actor,
} from '@/modules/automation/service';

// Tes integrasi terhadap database sungguhan (branch dev Neon), sebagai role lapakin_app.
const ownerUrl = process.env.MIGRATION_URL;
if (!ownerUrl) throw new Error('MIGRATION_URL belum diisi di .env');
const owner = neon(ownerUrl);

const tag = `auto-test-${Date.now()}`;
let u1 = 0;
let u2 = 0;
let A: Actor;
let B: Actor;

type R = Record<string, unknown>;
const rule = (o: R = {}) =>
  ruleInputSchema.parse({
    name: 'Remind overdue',
    event: 'invoice.overdue',
    action: 'notify',
    actionConfig: { title: 'Invoice {{number}} overdue', body: '{{contact}} owes {{balance}}', link: '/dashboard/invoices/{{invoiceId}}' },
    ...o,
  });
const payload = (o: R = {}) => ({ invoiceId: 7, number: 'F0007', contact: 'Budi', balance: 5000, daysOverdue: 3, ...o });

beforeAll(async () => {
  u1 = (await owner`insert into users (email, password_hash) values (${tag + '-1@test.local'}, 'x') returning id`)[0].id;
  u2 = (await owner`insert into users (email, password_hash) values (${tag + '-2@test.local'}, 'x') returning id`)[0].id;
  const a = (await owner`insert into teams (name) values (${tag + '-a'}) returning id`)[0].id as number;
  const b = (await owner`insert into teams (name) values (${tag + '-b'}) returning id`)[0].id as number;
  A = { teamId: a, userId: u1 };
  B = { teamId: b, userId: u1 };
  // Tim A: u1 owner, u2 member. Tim B: u1 owner.
  await owner`insert into team_members (user_id, team_id, role) values (${u1}, ${a}, 'owner'), (${u2}, ${a}, 'member'), (${u1}, ${b}, 'owner')`;
});

afterAll(async () => {
  const ids = [A.teamId, B.teamId];
  for (const t of ['activity_logs', 'auto_notifications', 'auto_runs', 'auto_rules', 'team_members']) {
    await owner.query(`delete from ${t} where team_id in (${ids[0]}, ${ids[1]})`);
  }
  await owner`delete from teams where id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from users where id in (${u1}, ${u2})`;
});

describe('aturan', () => {
  it('dibuat, diubah, dimatikan, dihapus, dan diaudit', async () => {
    const r = await createRule(A, rule({ name: 'Aturan CRUD' }));
    expect(r).toMatchObject({ name: 'Aturan CRUD', event: 'invoice.overdue', active: true });
    expect((await getRule(A.teamId, r.id))?.id).toBe(r.id);

    const u = await updateRule(A, r.id, rule({ name: 'Diubah', conditions: [{ field: 'daysOverdue', op: 'gte', value: 2 }] }));
    expect(u).toMatchObject({ name: 'Diubah', conditions: [{ field: 'daysOverdue', op: 'gte', value: 2 }] });
    expect((await setRuleActive(A, r.id, false)).active).toBe(false);

    await deleteRule(A, r.id);
    expect(await getRule(A.teamId, r.id)).toBeNull();
    await expect(deleteRule(A, r.id)).rejects.toBeInstanceOf(AutomationError);

    const [logs] = await withTenant(A.teamId, [
      db.select().from(activityLogs).where(and(eq(activityLogs.teamId, A.teamId), eq(activityLogs.entityId, r.id), eq(activityLogs.entityType, 'auto_rule'))),
    ]);
    expect(logs.map((l) => l.action)).toEqual([
      'AUTOMATION_RULE_CREATED',
      'AUTOMATION_RULE_UPDATED',
      'AUTOMATION_RULE_DISABLED',
      'AUTOMATION_RULE_DELETED',
    ]);
  });

  it('terisolasi per toko', async () => {
    const r = await createRule(A, rule({ name: 'Milik A' }));
    expect(await getRule(B.teamId, r.id)).toBeNull();
    expect((await listRules(B.teamId)).some((x) => x.id === r.id)).toBe(false);
    await expect(updateRule(B, r.id, rule())).rejects.toBeInstanceOf(AutomationError);
    await expect(setRuleActive(B, r.id, false)).rejects.toBeInstanceOf(AutomationError);
  });
});

describe('emit', () => {
  it('menjalankan aturan yang cocok: notifikasi ke semua owner dengan templat terisi, dan mencatat eksekusi', async () => {
    const r = await createRule(A, rule({ name: 'Notif owner' }));
    const res = await emit(A.teamId, 'invoice.overdue', payload());
    expect(res.ok).toBeGreaterThanOrEqual(1);
    expect(res.failed).toBe(0);

    const mine = await listNotifications(A.teamId, u1);
    const n = mine.find((x) => x.ruleId === r.id)!;
    expect(n).toMatchObject({ title: 'Invoice F0007 overdue', body: 'Budi owes 5000', link: '/dashboard/invoices/7', readAt: null });
    // u2 hanya member, bukan penerima untuk recipient "owners".
    expect((await listNotifications(A.teamId, u2)).some((x) => x.ruleId === r.id)).toBe(false);

    const runs = await listRuns(A.teamId, { ruleId: r.id });
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ status: 'ok', error: null, event: 'invoice.overdue' });
  });

  it('melewati aturan nonaktif, peristiwa lain, dan kondisi yang tidak terpenuhi', async () => {
    const off = await createRule(A, rule({ name: 'Mati', active: false }));
    const strict = await createRule(A, rule({ name: 'Ketat', conditions: [{ field: 'balance', op: 'gt', value: 1_000_000 }] }));
    await emit(A.teamId, 'invoice.overdue', payload());
    await emit(A.teamId, 'crm.followup_overdue', payload());
    expect(await listRuns(A.teamId, { ruleId: off.id })).toHaveLength(0);
    expect(await listRuns(A.teamId, { ruleId: strict.id })).toHaveLength(0);
  });

  it('dedupeKey mencegah aturan yang sama berjalan dua kali untuk hal yang sama', async () => {
    const r = await createRule(A, rule({ name: 'Sekali saja' }));
    const first = await emit(A.teamId, 'invoice.overdue', payload({ dedupeKey: `inv:99:${r.id}` }));
    const again = await emit(A.teamId, 'invoice.overdue', payload({ dedupeKey: `inv:99:${r.id}` }));
    expect(first.ok).toBeGreaterThanOrEqual(1);
    expect(again.skipped).toBeGreaterThanOrEqual(1);
    expect(await listRuns(A.teamId, { ruleId: r.id })).toHaveLength(1);
    // Kunci lain jalan lagi.
    await emit(A.teamId, 'invoice.overdue', payload({ dedupeKey: `inv:100:${r.id}` }));
    expect(await listRuns(A.teamId, { ruleId: r.id })).toHaveLength(2);
  });

  it('dua emit bersamaan dengan kunci sama hanya menjalankan aksi sekali', async () => {
    const r = await createRule(A, rule({ name: 'Balapan' }));
    const key = `race:${r.id}`;
    await Promise.all([emit(A.teamId, 'invoice.overdue', payload({ dedupeKey: key })), emit(A.teamId, 'invoice.overdue', payload({ dedupeKey: key }))]);
    expect(await listRuns(A.teamId, { ruleId: r.id })).toHaveLength(1);
    expect((await listNotifications(A.teamId, u1, { limit: 100 })).filter((n) => n.ruleId === r.id)).toHaveLength(1);
  });

  it('kegagalan aksi dicatat dan tidak melempar; aturan lain tetap jalan', async () => {
    // payload_user tanpa userId sah di payload -> aksi gagal.
    const bad = await createRule(
      A,
      rule({ name: 'Gagal', actionConfig: { title: 'x', recipient: 'payload_user' } })
    );
    const good = await createRule(A, rule({ name: 'Baik' }));
    const res = await emit(A.teamId, 'invoice.overdue', payload());
    expect(res.failed).toBeGreaterThanOrEqual(1);
    expect(res.ok).toBeGreaterThanOrEqual(1);
    const [run] = await listRuns(A.teamId, { ruleId: bad.id });
    expect(run.status).toBe('failed');
    expect(run.error).toMatch(/recipient/i);
    expect((await listRuns(A.teamId, { ruleId: good.id }))[0].status).toBe('ok');
  });

  it('recipient payload_user hanya ke anggota toko itu', async () => {
    const r = await createRule(A, rule({ name: 'Ke pengguna', actionConfig: { title: 'Halo {{contact}}', recipient: 'payload_user' } }));
    await emit(A.teamId, 'invoice.overdue', payload({ userId: u2 }));
    expect((await listNotifications(A.teamId, u2)).some((n) => n.ruleId === r.id)).toBe(true);
    // Pengguna di luar toko (u2 bukan anggota toko B) ditolak.
    const rb = await createRule(B, rule({ name: 'B', actionConfig: { title: 'x', recipient: 'payload_user' } }));
    await emit(B.teamId, 'invoice.overdue', payload({ userId: u2 }));
    expect((await listRuns(B.teamId, { ruleId: rb.id }))[0].status).toBe('failed');
  });

  it('peristiwa toko A tidak menjalankan aturan toko B', async () => {
    const rb = await createRule(B, rule({ name: 'Hanya B' }));
    await emit(A.teamId, 'invoice.overdue', payload());
    expect(await listRuns(B.teamId, { ruleId: rb.id })).toHaveLength(0);
  });
});

describe('notifikasi', () => {
  it('dihitung, ditandai dibaca satu per satu atau semua, hanya untuk pemiliknya', async () => {
    await createRule(A, rule({ name: 'Untuk hitung' }));
    await emit(A.teamId, 'invoice.overdue', payload({ dedupeKey: undefined }));
    const before = await countUnread(A.teamId, u1);
    expect(before).toBeGreaterThan(0);

    const [first] = await listNotifications(A.teamId, u1, { unreadOnly: true });
    // u2 tidak bisa menandai notifikasi milik u1.
    expect(await markRead(A.teamId, u2, first.id)).toBe(0);
    expect(await markRead(A.teamId, u1, first.id)).toBe(1);
    expect(await countUnread(A.teamId, u1)).toBe(before - 1);

    await markRead(A.teamId, u1);
    expect(await countUnread(A.teamId, u1)).toBe(0);
  });
});
