import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { and, eq } from 'drizzle-orm';

const ctx = vi.hoisted(() => ({
  current: null as null | { user: { id: number }; teamId: number; role: string },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('@/lib/auth/tenant', () => ({ getTenantContext: async () => ctx.current }));

import { db } from '@/lib/db/drizzle';
import { withTenant } from '@/lib/db/tenant';
import { activityLogs } from '@/lib/db/schema';
import { createTagAction, deleteTagAction, updateTagAction } from '@/modules/contacts/actions';
import { contactInputSchema } from '@/modules/contacts/schemas';
import {
  ContactError,
  createContact,
  createTag,
  deleteTag,
  getContact,
  listTags,
  updateTag,
  type Actor,
} from '@/modules/contacts/service';

// Tes integrasi untuk kelola tag (layanan dan Server Actions) terhadap database dev.
const ownerUrl = process.env.MIGRATION_URL;
if (!ownerUrl) throw new Error('MIGRATION_URL belum diisi di .env');
const owner = neon(ownerUrl);

const tag = `contact-tags-${Date.now()}`;
let userId = 0;
let A: Actor;
let B: Actor;

const as = (role: string, teamId = A.teamId) => {
  ctx.current = { user: { id: userId }, teamId, role };
};
const fd = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};
const expectCode = async (p: Promise<unknown>, code: string) => {
  const e = await p.then(
    () => null,
    (err) => err
  );
  expect(e).toBeInstanceOf(ContactError);
  expect((e as ContactError).code).toBe(code);
};
const DENIED = { error: 'You do not have permission to do this.' };
const auditOf = async (teamId: number, entityId: number) => {
  const [rows] = await withTenant(teamId, [
    db
      .select({ action: activityLogs.action, metadata: activityLogs.metadata })
      .from(activityLogs)
      .where(and(eq(activityLogs.teamId, teamId), eq(activityLogs.entityId, entityId), eq(activityLogs.entityType, 'contact_tag'))),
  ]);
  return rows;
};

beforeAll(async () => {
  userId = (await owner`insert into users (email, password_hash) values (${tag + '@test.local'}, 'x') returning id`)[0].id;
  A = { teamId: (await owner`insert into teams (name) values (${tag + '-a'}) returning id`)[0].id, userId };
  B = { teamId: (await owner`insert into teams (name) values (${tag + '-b'}) returning id`)[0].id, userId };
});

beforeEach(() => as('owner'));

afterAll(async () => {
  const ids = [A.teamId, B.teamId];
  await owner`delete from activity_logs where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from contact_tag_links where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from contacts where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from contact_tags where team_id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from teams where id in (${ids[0]}, ${ids[1]})`;
  await owner`delete from users where id = ${userId}`;
});

describe('updateTag', () => {
  it('mengubah nama dan warna, dan mencatat nama sebelumnya di audit', async () => {
    const t = await createTag(A, { name: 'Lama', color: null });
    const updated = await updateTag(A, t.id, { name: 'Baru', color: '#2563eb' });
    expect(updated).toMatchObject({ id: t.id, name: 'Baru', color: '#2563eb' });

    const tags = await listTags(A.teamId);
    expect(tags.find((x) => x.id === t.id)).toMatchObject({ name: 'Baru', color: '#2563eb' });

    const log = (await auditOf(A.teamId, t.id)).find((l) => l.action === 'CONTACT_TAG_UPDATED');
    expect(log?.metadata).toEqual({ name: 'Baru', previousName: 'Lama' });
  });

  it('nama kembar (tanpa membedakan huruf besar) ditolak, tetapi mengubah huruf besar tag sendiri boleh', async () => {
    const a = await createTag(A, { name: 'satu', color: null });
    await createTag(A, { name: 'Dua', color: null });
    await expectCode(updateTag(A, a.id, { name: 'DUA', color: null }), 'tag_exists');
    await expect(updateTag(A, a.id, { name: 'SATU', color: null })).resolves.toMatchObject({ name: 'SATU' });
  });

  it('tag tidak ada atau milik toko lain menghasilkan tag_not_found dan tidak berubah', async () => {
    const t = await createTag(A, { name: 'milik-a', color: null });
    await expectCode(updateTag(B, t.id, { name: 'dibajak', color: null }), 'tag_not_found');
    await expectCode(updateTag(A, 999999999, { name: 'x', color: null }), 'tag_not_found');
    expect((await listTags(A.teamId)).find((x) => x.id === t.id)?.name).toBe('milik-a');
  });
});

describe('deleteTag', () => {
  it('melepas tag dari semua kontak tanpa menghapus kontaknya, dan mencatat jumlahnya', async () => {
    const t = await createTag(A, { name: 'akan-dihapus', color: null });
    const c1 = await createContact(A, contactInputSchema.parse({ kind: 'person', name: 'D1', tagIds: [t.id] }));
    const c2 = await createContact(A, contactInputSchema.parse({ kind: 'person', name: 'D2', tagIds: [t.id] }));

    expect(await deleteTag(A, t.id)).toEqual({ removedFrom: 2 });

    expect((await listTags(A.teamId)).some((x) => x.id === t.id)).toBe(false);
    expect((await getContact(A.teamId, c1.id))?.tags).toEqual([]);
    expect((await getContact(A.teamId, c2.id))?.name).toBe('D2');

    const log = (await auditOf(A.teamId, t.id)).find((l) => l.action === 'CONTACT_TAG_DELETED');
    expect(log?.metadata).toEqual({ name: 'akan-dihapus', contactCount: 2 });
  });

  it('tag toko lain tidak bisa dihapus', async () => {
    const t = await createTag(A, { name: 'dijaga-a', color: null });
    await expectCode(deleteTag(B, t.id), 'tag_not_found');
    await expectCode(deleteTag(A, 999999999), 'tag_not_found');
    expect((await listTags(A.teamId)).some((x) => x.id === t.id)).toBe(true);
  });
});

describe('Server Actions tag', () => {
  it('semua anggota boleh membuat tag, dengan atau tanpa warna', async () => {
    as('member');
    expect(await createTagAction({}, fd([['name', 'Dari Member'], ['color', '']]))).toEqual({ success: 'Tag added' });
    expect(await createTagAction({}, fd([['name', 'Berwarna'], ['color', '#16a34a']]))).toEqual({ success: 'Tag added' });
    expect((await listTags(A.teamId)).find((x) => x.name === 'Berwarna')?.color).toBe('#16a34a');
  });

  it('warna dengan format salah ditolak', async () => {
    expect(await createTagAction({}, fd([['name', 'Salah Warna'], ['color', 'merah']]))).toEqual({
      error: 'Color must look like #1a2b3c',
    });
  });

  it('member ditolak mengubah dan menghapus tag, dan tag tidak berubah', async () => {
    const t = await createTag(A, { name: 'dijaga-member', color: null });
    as('member');
    expect(await updateTagAction({}, fd([['id', String(t.id)], ['name', 'Diubah']]))).toEqual(DENIED);
    expect(await deleteTagAction({}, fd([['id', String(t.id)]]))).toEqual(DENIED);
    expect((await listTags(A.teamId)).find((x) => x.id === t.id)?.name).toBe('dijaga-member');
  });

  it('owner bisa mengubah dan menghapus; kegagalan domain menjadi pesan', async () => {
    const t = await createTag(A, { name: 'aksi-owner', color: null });
    await createTag(A, { name: 'sudah-ada', color: null });

    expect(await updateTagAction({}, fd([['id', String(t.id)], ['name', 'aksi-owner-2'], ['color', '#9333ea']]))).toEqual({
      success: 'Tag saved',
    });
    expect(await updateTagAction({}, fd([['id', String(t.id)], ['name', 'SUDAH-ADA']]))).toEqual({
      error: 'A tag with this name already exists',
    });
    expect(await updateTagAction({}, fd([['name', 'tanpa-id']]))).toEqual({ error: 'Tag not found' });

    expect(await deleteTagAction({}, fd([['id', String(t.id)]]))).toEqual({ success: 'Tag deleted' });
    expect(await deleteTagAction({}, fd([['id', String(t.id)]]))).toEqual({ error: 'Tag not found' });
  });
});
