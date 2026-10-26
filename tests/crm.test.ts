import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { withTenant } from '@/lib/db/tenant';
import { activityLogs } from '@/lib/db/schema';
import { contactInputSchema } from '@/modules/contacts/schemas';
import { archiveContact, createContact, getContactNames } from '@/modules/contacts/service';
import { crmActivities, crmOpportunities, crmStages } from '@/modules/crm/schema';
import {
  activityInputSchema,
  boardQuerySchema,
  listQuerySchema,
  moveInputSchema,
  opportunityInputSchema,
} from '@/modules/crm/schemas';
import {
  CrmError,
  archiveOpportunity,
  completeActivity,
  createActivity,
  createOpportunity,
  getBoard,
  getOpportunity,
  listActivities,
  listOpportunities,
  listStages,
  moveOpportunity,
  reopenActivity,
  restoreOpportunity,
  updateOpportunity,
  type Actor,
} from '@/modules/crm/service';

// Tes integrasi terhadap database sungguhan (branch dev Neon), sebagai role lapakin_app.
const ownerUrl = process.env.MIGRATION_URL;
if (!ownerUrl) throw new Error('MIGRATION_URL belum diisi di .env');
const owner = neon(ownerUrl);

const tag = `crm-test-${Date.now()}`;
let u1 = 0; // anggota toko A dan B
let u2 = 0; // anggota toko A saja
let u3 = 0; // anggota toko B saja
let A: Actor;
let A2: Actor;
let B: Actor;

const opp = (o: Record<string, unknown> = {}) => opportunityInputSchema.parse({ title: 'Peluang', ...o });
const board = (teamId: number, q: Record<string, unknown> = {}) => getBoard(teamId, boardQuerySchema.parse(q));
const list = (teamId: number, q: Record<string, unknown> = {}) => listOpportunities(teamId, listQuerySchema.parse(q));
const stageByName = async (teamId: number, name: string) => (await listStages(teamId)).find((s) => s.name === name)!;
const expectCode = async (p: Promise<unknown>, code: string) => {
  const e = await p.then(
    () => null,
    (err) => err
  );
  expect(e).toBeInstanceOf(CrmError);
  expect((e as CrmError).code).toBe(code);
};
const auditActions = async (teamId: number, entityId: number) => {
  const [rows] = await withTenant(teamId, [
    db
      .select({ action: activityLogs.action, metadata: activityLogs.metadata })
      .from(activityLogs)
      .where(and(eq(activityLogs.teamId, teamId), eq(activityLogs.entityId, entityId), eq(activityLogs.entityType, 'crm_opportunity'))),
  ]);
  return rows;
};

beforeAll(async () => {
  const mk = async (n: number) =>
    (await owner`insert into users (email, password_hash) values (${`${tag}-${n}@test.local`}, 'x') returning id`)[0].id as number;
  [u1, u2, u3] = [await mk(1), await mk(2), await mk(3)];
  const teamA = (await owner`insert into teams (name) values (${tag + '-a'}) returning id`)[0].id as number;
  const teamB = (await owner`insert into teams (name) values (${tag + '-b'}) returning id`)[0].id as number;
  for (const [u, t] of [[u1, teamA], [u2, teamA], [u1, teamB], [u3, teamB]] as const) {
    await owner`insert into team_members (user_id, team_id, role) values (${u}, ${t}, 'member')`;
  }
  A = { teamId: teamA, userId: u1 };
  A2 = { teamId: teamA, userId: u2 };
  B = { teamId: teamB, userId: u1 };
});

afterAll(async () => {
  const ids = [A.teamId, B.teamId];
  await owner`delete from activity_logs where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from crm_activities where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from crm_opportunities where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from crm_stages where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from contact_tag_links where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from contacts where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from team_members where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from teams where id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from users where id in (${u1}, ${u2}, ${u3})`;
});

describe('tahap bawaan', () => {
  it('dibuat sekali per toko dalam urutan yang benar, dan toko lain punya tahapnya sendiri', async () => {
    const stages = await listStages(A.teamId);
    expect(stages.map((s) => [s.name, s.kind, s.probability])).toEqual([
      ['New', 'open', 10],
      ['Qualified', 'open', 25],
      ['Proposal', 'open', 50],
      ['Negotiation', 'open', 75],
      ['Won', 'won', 100],
      ['Lost', 'lost', 0],
    ]);
    expect((await listStages(A.teamId)).map((s) => s.id)).toEqual(stages.map((s) => s.id));

    const other = await listStages(B.teamId);
    expect(other).toHaveLength(6);
    expect(other.some((s) => stages.some((a) => a.id === s.id))).toBe(false);
  });

  it('banyak permintaan bersamaan pada toko baru tidak menggandakan tahap', async () => {
    const t = (await owner`insert into teams (name) values (${tag + '-race'}) returning id`)[0].id as number;
    try {
      const results = await Promise.all(Array.from({ length: 6 }, () => listStages(t)));
      expect(results.every((r) => r.length === 6)).toBe(true);
      const count = await owner`select count(*)::int n from crm_stages where team_id = ${t}`;
      expect(count[0].n).toBe(6);
    } finally {
      await owner`delete from crm_stages where team_id = ${t}`;
      await owner`delete from teams where id = ${t}`;
    }
  });

  it('tabel CRM tanpa konteks tenant kosong (RLS)', async () => {
    expect(await db.select().from(crmStages)).toEqual([]);
    expect(await db.select().from(crmOpportunities)).toEqual([]);
    expect(await db.select().from(crmActivities)).toEqual([]);
  });
});

describe('membuat peluang', () => {
  it('memakai tahap terbuka pertama dan pembuat sebagai penanggung jawab, dengan audit', async () => {
    const c = await createContact(A, contactInputSchema.parse({ kind: 'company', name: 'PT Klien' }));
    const o = await createOpportunity(A, opp({ title: 'Proyek Besar', contactId: c.id, expectedValue: 1500000.555 }));

    expect(o).toMatchObject({ title: 'Proyek Besar', contactId: c.id, ownerId: u1, expectedValue: 1500000.56, closedAt: null });
    expect((await stageByName(A.teamId, 'New')).id).toBe(o.stageId);

    const audit = (await auditActions(A.teamId, o.id)).find((l) => l.action === 'CRM_OPPORTUNITY_CREATED');
    expect(audit?.metadata).toEqual({ title: 'Proyek Besar', stage: 'New' });

    const detail = await getOpportunity(A.teamId, o.id);
    expect(detail).toMatchObject({ contactName: 'PT Klien', ownerName: expect.any(String) });
  });

  it('menolak kontak toko lain, kontak terarsip, tahap toko lain, dan penanggung jawab bukan anggota', async () => {
    const foreign = await createContact(B, contactInputSchema.parse({ kind: 'person', name: 'Milik B' }));
    await expectCode(createOpportunity(A, opp({ contactId: foreign.id })), 'invalid_contact');
    await expectCode(createOpportunity(A, opp({ contactId: 999999999 })), 'invalid_contact');

    const archived = await createContact(A, contactInputSchema.parse({ kind: 'person', name: 'Terarsip' }));
    await archiveContact({ ...A, userId: u1 }, archived.id);
    await expectCode(createOpportunity(A, opp({ contactId: archived.id })), 'invalid_contact');

    const bStage = await stageByName(B.teamId, 'New');
    await expectCode(createOpportunity(A, opp({ stageId: bStage.id })), 'invalid_stage');
    await expectCode(createOpportunity(A, opp({ ownerId: u3 })), 'invalid_owner');
  });

  it('database menolak peluang yang merujuk kontak atau tahap toko lain walau layanan dilewati', async () => {
    const aContact = await createContact(A, contactInputSchema.parse({ kind: 'person', name: 'Rujukan A' }));
    const aStage = await stageByName(A.teamId, 'New');
    const bStage = await stageByName(B.teamId, 'New');
    await expect(
      owner`insert into crm_opportunities (team_id, title, stage_id, contact_id) values (${B.teamId}, 'Penyusup', ${bStage.id}, ${aContact.id})`
    ).rejects.toThrow(/foreign key/i);
    await expect(
      owner`insert into crm_opportunities (team_id, title, stage_id) values (${B.teamId}, 'Penyusup', ${aStage.id})`
    ).rejects.toThrow(/foreign key/i);
  });

  it('database menolak nilai negatif dan prioritas di luar jangkauan', async () => {
    const s = await stageByName(A.teamId, 'New');
    await expect(
      owner`insert into crm_opportunities (team_id, title, stage_id, expected_value) values (${A.teamId}, 'X', ${s.id}, -5)`
    ).rejects.toThrow(/check/i);
    await expect(
      owner`insert into crm_opportunities (team_id, title, stage_id, priority) values (${A.teamId}, 'X', ${s.id}, 9)`
    ).rejects.toThrow(/check/i);
  });
});

describe('mengubah dan memindahkan peluang', () => {
  it('mengubah kolom, mengabaikan stageId, dan tidak bisa dilakukan toko lain', async () => {
    const o = await createOpportunity(A, opp({ title: 'Sebelum' }));
    const proposal = await stageByName(A.teamId, 'Proposal');
    const updated = await updateOpportunity(A2, o.id, opp({ title: 'Sesudah', priority: 2, ownerId: u2, stageId: proposal.id }));
    expect(updated).toMatchObject({ title: 'Sesudah', priority: 2, ownerId: u2, stageId: o.stageId });

    await expectCode(updateOpportunity(B, o.id, opp({ title: 'Dibajak' })), 'not_found');
    await expectCode(updateOpportunity(A, o.id, opp({ ownerId: u3 })), 'invalid_owner');
    expect((await getOpportunity(A.teamId, o.id))?.title).toBe('Sesudah');
  });

  it('pindah ke Won mengisi closedAt, ke Lost menyimpan alasan, kembali ke terbuka membersihkan keduanya', async () => {
    const o = await createOpportunity(A, opp({ title: 'Perjalanan' }));
    const [won, lost, proposal] = await Promise.all(['Won', 'Lost', 'Proposal'].map((n) => stageByName(A.teamId, n)));

    const w = await moveOpportunity(A, o.id, moveInputSchema.parse({ stageId: won.id, lostReason: 'diabaikan' }));
    expect(w.stageId).toBe(won.id);
    expect(w.closedAt).not.toBeNull();
    expect(w.lostReason).toBeNull();

    const l = await moveOpportunity(A, o.id, moveInputSchema.parse({ stageId: lost.id, lostReason: 'harga terlalu tinggi' }));
    expect(l.lostReason).toBe('harga terlalu tinggi');
    expect(l.closedAt).not.toBeNull();

    const reopened = await moveOpportunity(A, o.id, moveInputSchema.parse({ stageId: proposal.id }));
    expect(reopened.closedAt).toBeNull();
    expect(reopened.lostReason).toBeNull();

    const moves = (await auditActions(A.teamId, o.id)).filter((l) => l.action === 'CRM_OPPORTUNITY_MOVED');
    expect(moves.map((m) => m.metadata)).toEqual(
      expect.arrayContaining([
        { title: 'Perjalanan', fromStage: 'New', toStage: 'Won' },
        { title: 'Perjalanan', fromStage: 'Won', toStage: 'Lost' },
        { title: 'Perjalanan', fromStage: 'Lost', toStage: 'Proposal' },
      ])
    );
  });

  it('pindah ke tahap yang sama tidak mengubah apa pun dan tidak mencatat audit', async () => {
    const o = await createOpportunity(A, opp({ title: 'Diam' }));
    const before = (await auditActions(A.teamId, o.id)).length;
    const same = await moveOpportunity(A, o.id, moveInputSchema.parse({ stageId: o.stageId }));
    expect(same.updatedAt).toEqual(o.updatedAt);
    expect((await auditActions(A.teamId, o.id)).length).toBe(before);
  });

  it('menolak tahap toko lain dan peluang toko lain', async () => {
    const o = await createOpportunity(A, opp({ title: 'Terkunci' }));
    const bStage = await stageByName(B.teamId, 'Won');
    await expectCode(moveOpportunity(A, o.id, moveInputSchema.parse({ stageId: bStage.id })), 'invalid_stage');
    const aStage = await stageByName(A.teamId, 'Won');
    await expectCode(moveOpportunity(B, o.id, moveInputSchema.parse({ stageId: aStage.id })), 'not_found');
    expect((await getOpportunity(A.teamId, o.id))?.stageId).toBe(o.stageId);
  });
});

describe('papan dan daftar', () => {
  const ids: Record<string, number> = {};

  beforeAll(async () => {
    const t = await createContact(A, contactInputSchema.parse({ kind: 'company', name: 'Klien Papan' }));
    const [qualified, proposal, won] = await Promise.all(['Qualified', 'Proposal', 'Won'].map((n) => stageByName(A.teamId, n)));
    const make = async (key: string, o: Record<string, unknown>, stageId?: number) => {
      const created = await createOpportunity(A, opp(o));
      if (stageId) await moveOpportunity(A, created.id, moveInputSchema.parse({ stageId }));
      ids[key] = created.id;
    };
    await make('q1', { title: 'Papan Qualified Rendah', expectedValue: 1000, priority: 0, contactId: t.id }, qualified.id);
    await make('q2', { title: 'Papan Qualified Tinggi', expectedValue: 3000, priority: 3, expectedCloseDate: '2026-12-01' }, qualified.id);
    await make('p1', { title: 'Papan Proposal', expectedValue: 10000, ownerId: u2 }, proposal.id);
    await make('w1', { title: 'Papan Menang', expectedValue: 5000 }, won.id);
  });

  it('menghitung jumlah, total, dan nilai tertimbang per tahap, dengan urutan kartu menurut prioritas', async () => {
    const cols = await board(A.teamId, { q: 'Papan' });
    const col = (name: string) => cols.find((c) => c.stage.name === name)!;

    expect(cols.map((c) => c.stage.name)).toEqual(['New', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost']);
    expect(col('New')).toMatchObject({ count: 0, totalValue: 0, weightedValue: 0, items: [] });
    expect(col('Qualified')).toMatchObject({ count: 2, totalValue: 4000, weightedValue: 1000 });
    expect(col('Qualified').items.map((i) => i.title)).toEqual(['Papan Qualified Tinggi', 'Papan Qualified Rendah']);
    expect(col('Proposal')).toMatchObject({ count: 1, totalValue: 10000, weightedValue: 5000 });
    expect(col('Won')).toMatchObject({ count: 1, totalValue: 5000, weightedValue: 5000 });
    expect(cols.every((c) => !c.truncated)).toBe(true);
  });

  it('kartu membawa nama kontak, nama penanggung jawab, dan tanggal tutup', async () => {
    const cols = await board(A.teamId, { q: 'Papan' });
    const items = cols.flatMap((c) => c.items);
    expect(items.find((i) => i.id === ids.q1)).toMatchObject({ contactName: 'Klien Papan', expectedValue: 1000 });
    expect(items.find((i) => i.id === ids.q2)?.expectedCloseDate).toBe('2026-12-01');
    expect(items.find((i) => i.id === ids.p1)?.ownerName).toEqual(expect.any(String));
  });

  it('menyaring papan menurut kata kunci (wildcard diperlakukan sebagai teks) dan penanggung jawab', async () => {
    const byOwner = await board(A.teamId, { q: 'Papan', ownerId: u2 });
    expect(byOwner.flatMap((c) => c.items).map((i) => i.title)).toEqual(['Papan Proposal']);
    expect((await board(A.teamId, { q: '%' })).flatMap((c) => c.items)).toEqual([]);
    expect((await board(A.teamId, { q: 'rendah' })).flatMap((c) => c.items).map((i) => i.title)).toEqual(['Papan Qualified Rendah']);
  });

  it('toko lain tidak melihat peluang toko A di papan maupun daftar', async () => {
    expect((await board(B.teamId, { q: 'Papan' })).flatMap((c) => c.items)).toEqual([]);
    expect((await list(B.teamId, { q: 'Papan' })).total).toBe(0);
    expect(await getOpportunity(B.teamId, ids.q1)).toBeNull();
  });

  it('daftar: filter tahap, paginasi, nama tahap dan kontak', async () => {
    const qualified = await stageByName(A.teamId, 'Qualified');
    const r = await list(A.teamId, { q: 'Papan', stageId: qualified.id });
    expect(r.total).toBe(2);
    expect(r.items.every((i) => i.stageName === 'Qualified' && i.stageKind === 'open')).toBe(true);
    expect(r.items.find((i) => i.id === ids.q1)?.contactName).toBe('Klien Papan');

    const p1 = await list(A.teamId, { q: 'Papan', pageSize: 3, page: 1 });
    const p2 = await list(A.teamId, { q: 'Papan', pageSize: 3, page: 2 });
    expect(p1.total).toBe(4);
    expect(p1.pageCount).toBe(2);
    expect(p1.items).toHaveLength(3);
    expect(p2.items).toHaveLength(1);
  });

  it('peluang terarsip hilang dari papan dan daftar bawaan, muncul di daftar arsip, dan bisa dipulihkan', async () => {
    await archiveOpportunity(A, ids.q1);
    await archiveOpportunity(A, ids.q1);
    expect((await board(A.teamId, { q: 'Rendah' })).flatMap((c) => c.items)).toEqual([]);
    expect((await list(A.teamId, { q: 'Rendah' })).total).toBe(0);
    expect((await list(A.teamId, { q: 'Rendah', archived: true })).items.map((i) => i.id)).toEqual([ids.q1]);

    await expectCode(updateOpportunity(A, ids.q1, opp({ title: 'Edit' })), 'archived');
    await expectCode(moveOpportunity(A, ids.q1, moveInputSchema.parse({ stageId: (await stageByName(A.teamId, 'Won')).id })), 'archived');
    await expectCode(
      createActivity(A, activityInputSchema.parse({ opportunityId: ids.q1, kind: 'call', summary: 'x', dueDate: '2026-11-01' })),
      'archived'
    );

    await restoreOpportunity(A, ids.q1);
    expect((await board(A.teamId, { q: 'Rendah' })).flatMap((c) => c.items)).toHaveLength(1);
    const actions = (await auditActions(A.teamId, ids.q1)).map((l) => l.action);
    expect(actions.filter((a) => a === 'CRM_OPPORTUNITY_ARCHIVED')).toHaveLength(1);
    expect(actions).toContain('CRM_OPPORTUNITY_RESTORED');
  });
});

describe('aktivitas tindak lanjut', () => {
  const act = (opportunityId: number, o: Record<string, unknown> = {}) =>
    activityInputSchema.parse({ opportunityId, kind: 'call', summary: 'Hubungi klien', dueDate: '2026-11-10', ...o });

  it('dibuat untuk pembuatnya secara bawaan, atau untuk anggota lain; bukan anggota ditolak', async () => {
    const o = await createOpportunity(A, opp({ title: 'Ber-aktivitas' }));
    const mine = await createActivity(A, act(o.id));
    expect(mine).toMatchObject({ assignedTo: u1, kind: 'call', doneAt: null });
    expect(await createActivity(A, act(o.id, { assignedTo: u2, kind: 'meeting', dueDate: '2026-11-05' }))).toMatchObject({
      assignedTo: u2,
    });
    await expectCode(createActivity(A, act(o.id, { assignedTo: u3 })), 'invalid_owner');
    await expectCode(createActivity(B, act(o.id)), 'not_found');
  });

  it('daftar menaruh yang belum selesai lebih dulu, menurut tanggal jatuh tempo', async () => {
    const o = await createOpportunity(A, opp({ title: 'Urutan Aktivitas' }));
    const late = await createActivity(A, act(o.id, { summary: 'terakhir', dueDate: '2026-12-31' }));
    const early = await createActivity(A, act(o.id, { summary: 'pertama', dueDate: '2026-11-01' }));
    const mid = await createActivity(A, act(o.id, { summary: 'tengah', dueDate: '2026-11-15' }));
    await completeActivity(A, early.id);

    expect((await listActivities(A.teamId, o.id)).map((a) => a.summary)).toEqual(['tengah', 'terakhir', 'pertama']);
    expect((await listActivities(B.teamId, o.id))).toEqual([]);
    expect(late.id).not.toBe(mid.id);
  });

  it('menyelesaikan dan membuka kembali bersifat idempoten dan tercatat sekali per perubahan', async () => {
    const o = await createOpportunity(A, opp({ title: 'Selesaikan' }));
    const a = await createActivity(A, act(o.id, { summary: 'Kirim penawaran' }));

    const done = await completeActivity(A, a.id);
    expect(done.doneAt).not.toBeNull();
    await completeActivity(A, a.id);
    const reopened = await reopenActivity(A, a.id);
    expect(reopened.doneAt).toBeNull();
    await reopenActivity(A, a.id);

    const actions = (await auditActions(A.teamId, o.id)).map((l) => l.action);
    expect(actions.filter((x) => x === 'CRM_ACTIVITY_DONE')).toHaveLength(1);
    expect(actions.filter((x) => x === 'CRM_ACTIVITY_REOPENED')).toHaveLength(1);
    expect(actions.filter((x) => x === 'CRM_ACTIVITY_CREATED')).toHaveLength(1);
  });

  it('aktivitas toko lain tidak bisa diselesaikan, dan papan menampilkan jumlah serta tanggal berikutnya', async () => {
    const o = await createOpportunity(A, opp({ title: 'Penanda Papan' }));
    const a1 = await createActivity(A, act(o.id, { dueDate: '2026-11-20' }));
    await createActivity(A, act(o.id, { dueDate: '2026-11-12' }));

    await expectCode(completeActivity(B, a1.id), 'activity_not_found');
    await expectCode(completeActivity(A, 999999999), 'activity_not_found');
    expect((await listActivities(A.teamId, o.id)).every((x) => x.doneAt === null)).toBe(true);

    const item = (await board(A.teamId, { q: 'Penanda Papan' })).flatMap((c) => c.items)[0];
    expect(item).toMatchObject({ openActivities: 2, nextActivityDue: '2026-11-12' });

    await completeActivity(A, a1.id);
    const after = (await board(A.teamId, { q: 'Penanda Papan' })).flatMap((c) => c.items)[0];
    expect(after.openActivities).toBe(1);
  });

  it('database menolak aktivitas yang merujuk peluang toko lain', async () => {
    const o = await createOpportunity(A, opp({ title: 'Rujukan Aktivitas' }));
    await expect(
      owner`insert into crm_activities (team_id, opportunity_id, kind, summary, due_date) values (${B.teamId}, ${o.id}, 'call', 'Penyusup', '2026-11-01')`
    ).rejects.toThrow(/foreign key/i);
  });
});

describe('getContactNames (fungsi publik modul Kontak)', () => {
  it('mengembalikan nama dan status arsip hanya untuk kontak toko sendiri', async () => {
    const own = await createContact(A, contactInputSchema.parse({ kind: 'person', name: 'Nama Sendiri' }));
    const gone = await createContact(A, contactInputSchema.parse({ kind: 'person', name: 'Nama Arsip' }));
    await archiveContact(A, gone.id);
    const foreign = await createContact(B, contactInputSchema.parse({ kind: 'person', name: 'Nama Asing' }));

    const names = await getContactNames(A.teamId, [own.id, gone.id, foreign.id, 999999999, own.id]);
    expect([...names.entries()].sort((a, b) => a[0] - b[0])).toEqual(
      [
        [own.id, { name: 'Nama Sendiri', archived: false }],
        [gone.id, { name: 'Nama Arsip', archived: true }],
      ].sort((a, b) => (a[0] as number) - (b[0] as number))
    );
    expect((await getContactNames(A.teamId, [])).size).toBe(0);
  });
});
