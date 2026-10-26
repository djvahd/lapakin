import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { withTenant } from '@/lib/db/tenant';
import { activityLogs } from '@/lib/db/schema';
import {
  activityInputSchema,
  moveInputSchema,
  opportunityInputSchema,
  stageInputSchema,
} from '@/modules/crm/schemas';
import {
  CrmError,
  archiveOpportunity,
  completeActivity,
  countOverdueFollowUps,
  createActivity,
  createOpportunity,
  createStage,
  deleteStage,
  getBoard,
  getOpportunity,
  listFollowUps,
  listStageUsage,
  listStages,
  moveOpportunity,
  moveStage,
  updateStage,
  type Actor,
} from '@/modules/crm/service';

// Tes integrasi kelola tahap dan ringkasan tindak lanjut terhadap database dev, sebagai lapakin_app.
const ownerUrl = process.env.MIGRATION_URL;
if (!ownerUrl) throw new Error('MIGRATION_URL belum diisi di .env');
const owner = neon(ownerUrl);

const tag = `crm-stages-${Date.now()}`;
let u1 = 0;
let u2 = 0;
let A: Actor;
let B: Actor;

const stageIn = (name: string, probability = 0) => stageInputSchema.parse({ name, probability });
const opp = (title: string) => opportunityInputSchema.parse({ title });
const names = async (teamId: number) => (await listStages(teamId)).map((s) => s.name);
const positions = async (teamId: number) => (await listStages(teamId)).map((s) => s.position);
const byName = async (teamId: number, name: string) => (await listStages(teamId)).find((s) => s.name === name)!;
const expectCode = async (p: Promise<unknown>, code: string) => {
  const e = await p.then(
    () => null,
    (err) => err
  );
  expect(e).toBeInstanceOf(CrmError);
  expect((e as CrmError).code).toBe(code);
};
const audit = async (teamId: number, action: string) => {
  const [rows] = await withTenant(teamId, [
    db
      .select({ metadata: activityLogs.metadata, entityId: activityLogs.entityId })
      .from(activityLogs)
      .where(and(eq(activityLogs.teamId, teamId), eq(activityLogs.action, action))),
  ]);
  return rows;
};

beforeAll(async () => {
  const mk = async (n: number) =>
    (await owner`insert into users (email, password_hash) values (${`${tag}-${n}@test.local`}, 'x') returning id`)[0].id as number;
  [u1, u2] = [await mk(1), await mk(2)];
  const teamA = (await owner`insert into teams (name) values (${tag + '-a'}) returning id`)[0].id as number;
  const teamB = (await owner`insert into teams (name) values (${tag + '-b'}) returning id`)[0].id as number;
  for (const [u, t] of [[u1, teamA], [u2, teamA], [u1, teamB]] as const) {
    await owner`insert into team_members (user_id, team_id, role) values (${u}, ${t}, 'member')`;
  }
  A = { teamId: teamA, userId: u1 };
  B = { teamId: teamB, userId: u1 };
});

afterAll(async () => {
  const ids = [A.teamId, B.teamId];
  await owner`delete from activity_logs where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from crm_activities where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from crm_opportunities where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from crm_stages where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from team_members where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from teams where id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from users where id in (${u1}, ${u2})`;
});

describe('kelola tahap: buat dan ubah', () => {
  it('tahap baru masuk tepat sebelum Won dengan posisi berurutan, dan tercatat di audit', async () => {
    const created = await createStage(A, stageIn('Survey', 40));
    expect(created).toMatchObject({ name: 'Survey', kind: 'open', probability: 40 });
    expect(await names(A.teamId)).toEqual(['New', 'Qualified', 'Proposal', 'Negotiation', 'Survey', 'Won', 'Lost']);
    expect(await positions(A.teamId)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect((await audit(A.teamId, 'CRM_STAGE_CREATED')).map((r) => r.metadata)).toContainEqual({ name: 'Survey' });
  });

  it('nama kembar (tanpa membedakan huruf besar) ditolak dan tidak menggeser posisi apa pun', async () => {
    const before = await positions(A.teamId);
    await expectCode(createStage(A, stageIn('SURVEY')), 'stage_exists');
    expect(await positions(A.teamId)).toEqual(before);
    expect((await listStages(A.teamId)).filter((s) => s.name.toLowerCase() === 'survey')).toHaveLength(1);
  });

  it('mengubah nama dan probabilitas tahap terbuka; Won tetap 100 dan Lost tetap 0', async () => {
    const survey = await byName(A.teamId, 'Survey');
    expect(await updateStage(A, survey.id, stageIn('Survey Lokasi', 35))).toMatchObject({ name: 'Survey Lokasi', probability: 35 });

    const won = await byName(A.teamId, 'Won');
    const lost = await byName(A.teamId, 'Lost');
    expect(await updateStage(A, won.id, stageIn('Deal Closed', 10))).toMatchObject({ name: 'Deal Closed', probability: 100 });
    expect(await updateStage(A, lost.id, stageIn('Dropped', 90))).toMatchObject({ name: 'Dropped', probability: 0 });
    await updateStage(A, won.id, stageIn('Won', 100));
    await updateStage(A, lost.id, stageIn('Lost', 0));

    const log = (await audit(A.teamId, 'CRM_STAGE_UPDATED')).find((r) => (r.metadata as { name?: string })?.name === 'Survey Lokasi');
    expect(log?.metadata).toEqual({ name: 'Survey Lokasi', previousName: 'Survey' });
  });

  it('nama kembar saat mengubah ditolak, tetapi mengubah huruf besar tahap sendiri boleh', async () => {
    const survey = await byName(A.teamId, 'Survey Lokasi');
    await expectCode(updateStage(A, survey.id, stageIn('proposal')), 'stage_exists');
    await expect(updateStage(A, survey.id, stageIn('SURVEY LOKASI', 35))).resolves.toMatchObject({ name: 'SURVEY LOKASI' });
    await updateStage(A, survey.id, stageIn('Survey Lokasi', 35));
  });

  it('tahap toko lain tidak bisa diubah dan tahap tidak dikenal ditolak', async () => {
    const bStage = await byName(B.teamId, 'New');
    await expectCode(updateStage(A, bStage.id, stageIn('Dibajak')), 'invalid_stage');
    await expectCode(updateStage(A, 999999999, stageIn('X')), 'invalid_stage');
    expect((await byName(B.teamId, 'New')).name).toBe('New');
  });
});

describe('kelola tahap: urutan', () => {
  it('menukar tahap terbuka ke atas dan ke bawah dengan posisi tetap berurutan', async () => {
    const before = await names(A.teamId);
    const survey = await byName(A.teamId, 'Survey Lokasi');

    await moveStage(A, survey.id, 'up');
    const up = await names(A.teamId);
    expect(up.indexOf('Survey Lokasi')).toBe(before.indexOf('Survey Lokasi') - 1);
    expect(await positions(A.teamId)).toEqual([0, 1, 2, 3, 4, 5, 6]);

    await moveStage(A, survey.id, 'down');
    expect(await names(A.teamId)).toEqual(before);

    const columns = await getBoard(A.teamId, {});
    expect(columns.map((c) => c.stage.name)).toEqual(before);
  });

  it('di ujung daftar tidak berubah, dan tidak pernah melewati Won', async () => {
    const stages = await listStages(A.teamId);
    const first = stages[0];
    const lastOpen = stages.filter((s) => s.kind === 'open').at(-1)!;
    const snapshot = await names(A.teamId);

    await moveStage(A, first.id, 'up');
    await moveStage(A, lastOpen.id, 'down');
    expect(await names(A.teamId)).toEqual(snapshot);
  });

  it('Won dan Lost terkunci di ujung; tahap toko lain atau tak dikenal ditolak', async () => {
    const won = await byName(A.teamId, 'Won');
    const lost = await byName(A.teamId, 'Lost');
    await expectCode(moveStage(A, won.id, 'up'), 'stage_locked');
    await expectCode(moveStage(A, lost.id, 'down'), 'stage_locked');
    await expectCode(moveStage(A, (await byName(B.teamId, 'New')).id, 'down'), 'invalid_stage');
    await expectCode(moveStage(A, 999999999, 'up'), 'invalid_stage');
  });
});

describe('kelola tahap: hapus', () => {
  it('menghapus tahap kosong dan merapikan posisi', async () => {
    const extra = await createStage(A, stageIn('Sementara'));
    expect(await deleteStage(A, extra.id, null)).toEqual({ moved: 0 });
    expect(await names(A.teamId)).not.toContain('Sementara');
    expect(await positions(A.teamId)).toEqual([...(await positions(A.teamId)).keys()]);
    expect((await audit(A.teamId, 'CRM_STAGE_DELETED')).map((r) => r.metadata)).toContainEqual({
      name: 'Sementara',
      moved: 0,
      movedTo: null,
    });
  });

  it('tahap berisi peluang butuh tujuan; semua peluang, termasuk yang diarsipkan, dipindahkan atomik', async () => {
    const doomed = await createStage(A, stageIn('Akan Dihapus', 20));
    const o1 = await createOpportunity(A, { ...opp('Aktif'), stageId: doomed.id });
    const o2 = await createOpportunity(A, { ...opp('Diarsipkan'), stageId: doomed.id });
    await archiveOpportunity(A, o2.id);
    const qualified = await byName(A.teamId, 'Qualified');

    expect((await listStageUsage(A.teamId)).find((s) => s.id === doomed.id)?.opportunityCount).toBe(2);
    await expectCode(deleteStage(A, doomed.id, null), 'stage_not_empty');
    await expectCode(deleteStage(A, doomed.id, doomed.id), 'invalid_stage');
    await expectCode(deleteStage(A, doomed.id, (await byName(B.teamId, 'New')).id), 'invalid_stage');
    expect(await names(A.teamId)).toContain('Akan Dihapus');

    expect(await deleteStage(A, doomed.id, qualified.id)).toEqual({ moved: 2 });
    expect(await names(A.teamId)).not.toContain('Akan Dihapus');
    expect((await getOpportunity(A.teamId, o1.id))?.stageId).toBe(qualified.id);
    expect((await getOpportunity(A.teamId, o2.id))?.stageId).toBe(qualified.id);
  });

  it('memindahkan ke Won mengisi closedAt dan ke tahap terbuka mengosongkannya', async () => {
    const s = await createStage(A, stageIn('Ke Won'));
    const o = await createOpportunity(A, { ...opp('Menjadi Menang'), stageId: s.id });
    const won = await byName(A.teamId, 'Won');
    await deleteStage(A, s.id, won.id);
    const afterWon = await getOpportunity(A.teamId, o.id);
    expect(afterWon?.stageId).toBe(won.id);
    expect(afterWon?.closedAt).not.toBeNull();

    const s2 = await createStage(A, stageIn('Ke Terbuka'));
    const o2 = await createOpportunity(A, { ...opp('Tetap Terbuka'), stageId: s2.id });
    await deleteStage(A, s2.id, (await byName(A.teamId, 'New')).id);
    expect((await getOpportunity(A.teamId, o2.id))?.closedAt).toBeNull();
  });

  it('Won, Lost, dan satu-satunya tahap terbuka tidak bisa dihapus', async () => {
    await expectCode(deleteStage(A, (await byName(A.teamId, 'Won')).id, null), 'stage_locked');
    await expectCode(deleteStage(A, (await byName(A.teamId, 'Lost')).id, null), 'stage_locked');

    const t = (await owner`insert into teams (name) values (${tag + '-solo'}) returning id`)[0].id as number;
    await owner`insert into team_members (user_id, team_id, role) values (${u1}, ${t}, 'member')`;
    const solo: Actor = { teamId: t, userId: u1 };
    try {
      const stages = await listStages(t);
      const opens = stages.filter((s) => s.kind === 'open');
      for (const s of opens.slice(1)) await deleteStage(solo, s.id, null);
      await expectCode(deleteStage(solo, opens[0].id, null), 'stage_locked');
      expect((await listStages(t)).filter((s) => s.kind === 'open')).toHaveLength(1);
    } finally {
      await owner`delete from activity_logs where team_id = ${t}`;
      await owner`delete from crm_stages where team_id = ${t}`;
      await owner`delete from team_members where team_id = ${t}`;
      await owner`delete from teams where id = ${t}`;
    }
  });

  it('operasi tahap di toko A tidak menyentuh tahap toko B', async () => {
    const before = await listStages(B.teamId);
    const extra = await createStage(A, stageIn('Hanya A'));
    await deleteStage(A, extra.id, null);
    expect(await listStages(B.teamId)).toEqual(before);
  });
});

describe('ringkasan tindak lanjut', () => {
  let oppId = 0;
  let archivedOppId = 0;
  const act = (opportunityId: number, o: Record<string, unknown>) =>
    activityInputSchema.parse({ opportunityId, kind: 'call', summary: 'Tindak lanjut', dueDate: '2026-11-10', ...o });

  beforeAll(async () => {
    oppId = (await createOpportunity(A, opp('Peluang Ringkasan'))).id;
    archivedOppId = (await createOpportunity(A, opp('Peluang Terarsip Ringkasan'))).id;
    await createActivity(A, act(oppId, { summary: 'terlambat-saya', dueDate: '2026-10-20', assignedTo: u1 }));
    await createActivity(A, act(oppId, { summary: 'hari-ini-saya', dueDate: '2026-10-26', assignedTo: u1 }));
    await createActivity(A, act(oppId, { summary: 'nanti-saya', dueDate: '2026-11-30', assignedTo: u1 }));
    await createActivity(A, act(oppId, { summary: 'terlambat-lain', dueDate: '2026-10-21', assignedTo: u2 }));
    const done = await createActivity(A, act(oppId, { summary: 'sudah-selesai', dueDate: '2026-10-01', assignedTo: u1 }));
    await completeActivity(A, done.id);
    await createActivity(A, act(archivedOppId, { summary: 'di-peluang-arsip', dueDate: '2026-10-02', assignedTo: u1 }));
    await archiveOpportunity(A, archivedOppId);
  });

  it('mendaftar yang belum selesai pada peluang aktif menurut jatuh tempo, lengkap dengan judul peluang', async () => {
    const all = await listFollowUps(A.teamId);
    expect(all.map((f) => f.summary)).toEqual(['terlambat-saya', 'terlambat-lain', 'hari-ini-saya', 'nanti-saya']);
    expect(all[0]).toMatchObject({ opportunityId: oppId, opportunityTitle: 'Peluang Ringkasan', assignedTo: u1 });
    expect(all[0].assigneeName).toEqual(expect.any(String));
  });

  it('menyaring menurut penanggung jawab dan membatasi jumlah', async () => {
    expect((await listFollowUps(A.teamId, { assignedTo: u2 })).map((f) => f.summary)).toEqual(['terlambat-lain']);
    expect((await listFollowUps(A.teamId, { assignedTo: u1 })).map((f) => f.summary)).toEqual([
      'terlambat-saya',
      'hari-ini-saya',
      'nanti-saya',
    ]);
    expect(await listFollowUps(A.teamId, { limit: 2 })).toHaveLength(2);
  });

  it('toko lain tidak melihat tindak lanjut toko A', async () => {
    expect(await listFollowUps(B.teamId)).toEqual([]);
    expect(await countOverdueFollowUps(B.teamId, u1, '2026-10-26')).toBe(0);
  });

  it('menghitung terlambat milik satu orang: jatuh tempo hari ini belum terlambat, selesai dan peluang arsip dikecualikan', async () => {
    expect(await countOverdueFollowUps(A.teamId, u1, '2026-10-26')).toBe(1);
    expect(await countOverdueFollowUps(A.teamId, u1, '2026-10-27')).toBe(2);
    expect(await countOverdueFollowUps(A.teamId, u2, '2026-10-26')).toBe(1);
    expect(await countOverdueFollowUps(A.teamId, u1, '2026-10-20')).toBe(0);
  });

  it('memindahkan peluang tidak memengaruhi tindak lanjutnya', async () => {
    const proposal = await byName(A.teamId, 'Proposal');
    await moveOpportunity(A, oppId, moveInputSchema.parse({ stageId: proposal.id }));
    expect(await countOverdueFollowUps(A.teamId, u1, '2026-10-26')).toBe(1);
  });
});
