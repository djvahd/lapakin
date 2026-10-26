import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { neon } from '@neondatabase/serverless';

const ctx = vi.hoisted(() => ({
  current: null as null | { user: { id: number }; teamId: number; role: string },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));
vi.mock('@/lib/auth/tenant', () => ({ getTenantContext: async () => ctx.current }));

import {
  archiveOpportunityAction,
  completeActivityAction,
  createActivityAction,
  createOpportunityAction,
  createStageAction,
  deleteStageAction,
  moveOpportunityAction,
  moveStageAction,
  updateStageAction,
  reopenActivityAction,
  restoreOpportunityAction,
  updateOpportunityAction,
} from '@/modules/crm/actions';
import { contactInputSchema } from '@/modules/contacts/schemas';
import { createContact } from '@/modules/contacts/service';
import { getOpportunity, listStages } from '@/modules/crm/service';

// Server Actions CRM terhadap database sungguhan; konteks tenant dipalsukan agar peran bisa diatur.
const ownerUrl = process.env.MIGRATION_URL;
if (!ownerUrl) throw new Error('MIGRATION_URL belum diisi di .env');
const owner = neon(ownerUrl);

const tag = `crm-actions-${Date.now()}`;
let userId = 0;
let teamA = 0;
let teamB = 0;

const as = (role: string, teamId = teamA) => {
  ctx.current = { user: { id: userId }, teamId, role };
};
const fd = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};
const DENIED = { error: 'You do not have permission to do this.' };
const redirected = async (p: Promise<unknown>) => {
  const e = await p.then(
    () => null,
    (err) => err as Error
  );
  expect(e?.message).toMatch(/^NEXT_REDIRECT:/);
  return e!.message.replace('NEXT_REDIRECT:', '');
};
const create = async (title: string, extra: [string, string][] = []) => {
  const url = await redirected(createOpportunityAction({}, fd([['title', title], ...extra])));
  return Number(url.split('/').pop());
};
const stageId = async (name: string, teamId = teamA) => (await listStages(teamId)).find((s) => s.name === name)!.id;

beforeAll(async () => {
  userId = (await owner`insert into users (email, password_hash) values (${tag + '@test.local'}, 'x') returning id`)[0].id;
  teamA = (await owner`insert into teams (name) values (${tag + '-a'}) returning id`)[0].id;
  teamB = (await owner`insert into teams (name) values (${tag + '-b'}) returning id`)[0].id;
  await owner`insert into team_members (user_id, team_id, role) values (${userId}, ${teamA}, 'owner')`;
  await owner`insert into team_members (user_id, team_id, role) values (${userId}, ${teamB}, 'owner')`;
});

beforeEach(() => as('owner'));

afterAll(async () => {
  const ids = [teamA, teamB];
  await owner`delete from activity_logs where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from crm_activities where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from crm_opportunities where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from crm_stages where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from contacts where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from team_members where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from teams where id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from users where id = ${userId}`;
});

describe('createOpportunityAction', () => {
  it('membuat peluang dan mengalihkan ke halaman detailnya, juga oleh member', async () => {
    const id = await create('Peluang Baru', [['expectedValue', '2500000'], ['priority', '1']]);
    expect(await getOpportunity(teamA, id)).toMatchObject({ title: 'Peluang Baru', expectedValue: 2500000, priority: 1 });

    as('member');
    await create('Dibuat Member');
  });

  it('nilai berformat ambigu ditolak dengan pesan dan tidak membuat apa pun', async () => {
    const r = await createOpportunityAction({}, fd([['title', 'Salah'], ['expectedValue', '1.500.000']]));
    expect(r).toEqual({ error: 'Enter the expected value as a plain number, for example 1500000 or 1500000.50' });
  });

  it('kontak milik toko lain ditolak dengan pesan yang ramah', async () => {
    const foreign = await createContact({ teamId: teamB, userId }, contactInputSchema.parse({ kind: 'person', name: 'Milik B' }));
    expect(await createOpportunityAction({}, fd([['title', 'Tembus'], ['contactId', String(foreign.id)]]))).toEqual({
      error: 'Contact not found',
    });
  });

  it('tanpa konteks toko melempar error', async () => {
    ctx.current = null;
    await expect(createOpportunityAction({}, fd([['title', 'X']]))).rejects.toThrow('not authenticated');
  });
});

describe('updateOpportunityAction dan moveOpportunityAction', () => {
  it('mengubah peluang; id hilang dan peluang toko lain menghasilkan Opportunity not found', async () => {
    const id = await create('Sebelum');
    expect(await updateOpportunityAction({}, fd([['id', String(id)], ['title', 'Sesudah'], ['priority', '3']]))).toEqual({
      success: 'Opportunity saved',
    });
    expect(await getOpportunity(teamA, id)).toMatchObject({ title: 'Sesudah', priority: 3 });

    expect(await updateOpportunityAction({}, fd([['title', 'Tanpa id']]))).toEqual({ error: 'Opportunity not found' });
    as('owner', teamB);
    expect(await updateOpportunityAction({}, fd([['id', String(id)], ['title', 'Dibajak']]))).toEqual({
      error: 'Opportunity not found',
    });
    expect((await getOpportunity(teamA, id))?.title).toBe('Sesudah');
  });

  it('memindahkan tahap: Lost menyimpan alasan, tahap toko lain ditolak, tahap kosong ditolak', async () => {
    const id = await create('Berpindah');
    const lost = await stageId('Lost');

    expect(await moveOpportunityAction({}, fd([['id', String(id)], ['stageId', String(lost)], ['lostReason', 'harga']]))).toEqual({
      success: 'Stage updated',
    });
    expect(await getOpportunity(teamA, id)).toMatchObject({ stageId: lost, lostReason: 'harga' });

    const foreignStage = await stageId('Won', teamB);
    expect(await moveOpportunityAction({}, fd([['id', String(id)], ['stageId', String(foreignStage)]]))).toEqual({
      error: 'Stage not found',
    });
    expect(await moveOpportunityAction({}, fd([['id', String(id)], ['stageId', '']]))).toEqual({ error: 'Choose a stage' });
  });

  it('semua anggota boleh mengubah dan memindahkan', async () => {
    const id = await create('Milik Bersama');
    as('member');
    expect(await updateOpportunityAction({}, fd([['id', String(id)], ['title', 'Diubah Member']]))).toEqual({
      success: 'Opportunity saved',
    });
    expect(await moveOpportunityAction({}, fd([['id', String(id)], ['stageId', String(await stageId('Qualified'))]]))).toEqual({
      success: 'Stage updated',
    });
  });
});

describe('arsip', () => {
  it('member ditolak di server; owner bisa mengarsipkan dan memulihkan; peluang terarsip tidak bisa diubah', async () => {
    const id = await create('Diarsipkan');

    as('member');
    expect(await archiveOpportunityAction({}, fd([['id', String(id)]]))).toEqual(DENIED);
    expect((await getOpportunity(teamA, id))?.archivedAt).toBeNull();

    as('owner');
    expect(await archiveOpportunityAction({}, fd([['id', String(id)]]))).toEqual({ success: 'Opportunity archived' });
    expect(await updateOpportunityAction({}, fd([['id', String(id)], ['title', 'Edit']]))).toEqual({
      error: 'Restore the opportunity before editing',
    });

    as('member');
    expect(await restoreOpportunityAction({}, fd([['id', String(id)]]))).toEqual(DENIED);
    as('owner');
    expect(await restoreOpportunityAction({}, fd([['id', String(id)]]))).toEqual({ success: 'Opportunity restored' });
    expect((await getOpportunity(teamA, id))?.archivedAt).toBeNull();
  });
});

describe('aktivitas', () => {
  it('menjadwalkan, menyelesaikan, dan membuka kembali tindak lanjut', async () => {
    const id = await create('Ber-aktivitas');
    expect(
      await createActivityAction({}, fd([['opportunityId', String(id)], ['kind', 'call'], ['summary', 'Telepon klien'], ['dueDate', '2026-11-10']]))
    ).toEqual({ success: 'Follow-up scheduled' });

    const activity = (await getOpportunity(teamA, id))!.activities[0];
    expect(activity).toMatchObject({ summary: 'Telepon klien', kind: 'call', doneAt: null, assignedTo: userId });

    expect(await completeActivityAction({}, fd([['id', String(activity.id)], ['opportunityId', String(id)]]))).toEqual({
      success: 'Follow-up completed',
    });
    expect((await getOpportunity(teamA, id))!.activities[0].doneAt).not.toBeNull();

    expect(await reopenActivityAction({}, fd([['id', String(activity.id)], ['opportunityId', String(id)]]))).toEqual({
      success: 'Follow-up reopened',
    });
    expect((await getOpportunity(teamA, id))!.activities[0].doneAt).toBeNull();
  });

  it('input salah dan rujukan toko lain menghasilkan pesan, member boleh menjadwalkan', async () => {
    const id = await create('Aktivitas Salah');
    expect(await createActivityAction({}, fd([['opportunityId', String(id)], ['kind', 'call'], ['summary', 'x']]))).toEqual({
      error: 'Choose a due date',
    });
    expect(
      await createActivityAction({}, fd([['opportunityId', '999999999'], ['kind', 'call'], ['summary', 'x'], ['dueDate', '2026-11-10']]))
    ).toEqual({ error: 'Opportunity not found' });

    as('owner', teamB);
    expect(
      await createActivityAction({}, fd([['opportunityId', String(id)], ['kind', 'call'], ['summary', 'x'], ['dueDate', '2026-11-10']]))
    ).toEqual({ error: 'Opportunity not found' });
    expect(await completeActivityAction({}, fd([['id', '999999999']]))).toEqual({ error: 'Follow-up not found' });
    expect(await completeActivityAction({}, fd([]))).toEqual({ error: 'Follow-up not found' });

    as('member');
    expect(
      await createActivityAction({}, fd([['opportunityId', String(id)], ['kind', 'todo'], ['summary', 'Dari member'], ['dueDate', '2026-11-11']]))
    ).toEqual({ success: 'Follow-up scheduled' });
  });
});

describe('kelola tahap (hanya owner)', () => {
  it('member ditolak di server untuk semua aksi tahap dan tidak ada yang berubah', async () => {
    const survey = (await listStages(teamA)).find((s) => s.kind === 'open')!;
    const before = (await listStages(teamA)).map((s) => s.name);
    as('member');
    expect(await createStageAction({}, fd([['name', 'Tak Boleh']]))).toEqual(DENIED);
    expect(await updateStageAction({}, fd([['id', String(survey.id)], ['name', 'Tak Boleh']]))).toEqual(DENIED);
    expect(await moveStageAction({}, fd([['id', String(survey.id)], ['direction', 'down']]))).toEqual(DENIED);
    expect(await deleteStageAction({}, fd([['id', String(survey.id)]]))).toEqual(DENIED);
    expect((await listStages(teamA)).map((s) => s.name)).toEqual(before);
  });

  it('owner menambah, mengubah, mengurutkan, dan menghapus tahap', async () => {
    expect(await createStageAction({}, fd([['name', 'Survey Aksi'], ['probability', '30']]))).toEqual({ success: 'Stage added' });
    let stage = (await listStages(teamA)).find((s) => s.name === 'Survey Aksi')!;
    expect(stage).toMatchObject({ kind: 'open', probability: 30 });

    expect(await updateStageAction({}, fd([['id', String(stage.id)], ['name', 'Survey Lapangan'], ['probability', '45']]))).toEqual({
      success: 'Stage saved',
    });
    stage = (await listStages(teamA)).find((s) => s.id === stage.id)!;
    expect(stage).toMatchObject({ name: 'Survey Lapangan', probability: 45 });

    const indexBefore = (await listStages(teamA)).findIndex((s) => s.id === stage.id);
    expect(await moveStageAction({}, fd([['id', String(stage.id)], ['direction', 'up']]))).toEqual({ success: 'Stage moved' });
    expect((await listStages(teamA)).findIndex((s) => s.id === stage.id)).toBe(indexBefore - 1);

    expect(await deleteStageAction({}, fd([['id', String(stage.id)]]))).toEqual({ success: 'Stage deleted' });
    expect((await listStages(teamA)).some((s) => s.id === stage.id)).toBe(false);
  });

  it('input salah dan aturan domain menjadi pesan yang jelas', async () => {
    expect(await createStageAction({}, fd([['name', 'X'], ['probability', '150']]))).toEqual({
      error: 'Probability must be a whole number between 0 and 100',
    });
    expect(await createStageAction({}, fd([['name', 'new']]))).toEqual({ error: 'A stage with this name already exists' });
    expect(await updateStageAction({}, fd([['name', 'Tanpa id']]))).toEqual({ error: 'Stage not found' });
    expect(await moveStageAction({}, fd([['id', '1'], ['direction', 'sideways']]))).toEqual({ error: 'Stage not found' });

    const won = (await listStages(teamA)).find((s) => s.kind === 'won')!;
    expect(await moveStageAction({}, fd([['id', String(won.id)], ['direction', 'up']]))).toEqual({
      error: 'Won and Lost always stay at the end',
    });
    expect(await deleteStageAction({}, fd([['id', String(won.id)]]))).toEqual({ error: 'Won and Lost cannot be deleted' });
  });

  it('menghapus tahap berisi peluang butuh tujuan, lalu memindahkannya', async () => {
    await createStageAction({}, fd([['name', 'Berisi']]));
    const stage = (await listStages(teamA)).find((s) => s.name === 'Berisi')!;
    const oppId = await create('Penghuni Tahap', [['stageId', String(stage.id)]]);

    expect(await deleteStageAction({}, fd([['id', String(stage.id)]]))).toEqual({
      error: 'Choose a stage to move its opportunities to',
    });
    const qualified = (await listStages(teamA)).find((s) => s.name === 'Qualified')!;
    expect(await deleteStageAction({}, fd([['id', String(stage.id)], ['moveTo', String(qualified.id)]]))).toEqual({
      success: 'Stage deleted',
    });
    expect((await getOpportunity(teamA, oppId))?.stageId).toBe(qualified.id);
  });
});
