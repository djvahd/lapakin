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
  archiveContactAction,
  createContactAction,
  createTagAction,
  restoreContactAction,
  updateContactAction,
} from '@/modules/contacts/actions';
import { createContact, createTag, getContact, listContacts } from '@/modules/contacts/service';
import { contactInputSchema, listQuerySchema } from '@/modules/contacts/schemas';

// Server Actions terhadap database sungguhan; konteks tenant dipalsukan agar peran bisa diatur.
const ownerUrl = process.env.MIGRATION_URL;
if (!ownerUrl) throw new Error('MIGRATION_URL belum diisi di .env');
const owner = neon(ownerUrl);

const tag = `contact-actions-${Date.now()}`;
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
const redirected = async (p: Promise<unknown>) => {
  const e = await p.then(
    () => null,
    (err) => err as Error
  );
  expect(e?.message).toMatch(/^NEXT_REDIRECT:/);
  return e!.message.replace('NEXT_REDIRECT:', '');
};
const DENIED = { error: 'You do not have permission to do this.' };

beforeAll(async () => {
  const u = await owner`insert into users (email, password_hash) values (${tag + '@test.local'}, 'x') returning id`;
  userId = u[0].id;
  teamA = (await owner`insert into teams (name) values (${tag + '-a'}) returning id`)[0].id;
  teamB = (await owner`insert into teams (name) values (${tag + '-b'}) returning id`)[0].id;
});

beforeEach(() => as('owner'));

afterAll(async () => {
  await owner`delete from activity_logs where team_id in (${teamA}, ${teamB})`;
  await owner`delete from contact_tag_links where team_id in (${teamA}, ${teamB})`;
  await owner`delete from contacts where team_id in (${teamA}, ${teamB})`;
  await owner`delete from contact_tags where team_id in (${teamA}, ${teamB})`;
  await owner`delete from teams where id in (${teamA}, ${teamB})`;
  await owner`delete from users where id = ${userId}`;
});

describe('createContactAction', () => {
  it('membuat kontak lalu mengalihkan ke halaman detailnya', async () => {
    const url = await redirected(
      createContactAction({}, fd([['kind', 'company'], ['name', 'PT Aksi'], ['isSupplier', 'on']]))
    );
    const id = Number(url.split('/').pop());
    expect(url).toBe(`/dashboard/contacts/${id}`);
    expect(await getContact(teamA, id)).toMatchObject({ name: 'PT Aksi', kind: 'company', isSupplier: true });
  });

  it('semua anggota boleh membuat kontak, bukan hanya owner', async () => {
    as('member');
    await redirected(createContactAction({}, fd([['kind', 'person'], ['name', 'Dibuat Member']])));
  });

  it('input tidak valid menghasilkan pesan dan tidak membuat apa pun', async () => {
    const before = (await listContacts(teamA, listQuerySchema.parse({ pageSize: 100 }))).total;
    const r = await createContactAction({}, fd([['kind', 'person'], ['name', 'X'], ['email', 'salah']]));
    expect(r).toEqual({ error: 'Invalid email address' });
    expect((await listContacts(teamA, listQuerySchema.parse({ pageSize: 100 }))).total).toBe(before);
  });

  it('perusahaan milik toko lain ditolak dengan pesan yang ramah', async () => {
    const other = await createContact(
      { teamId: teamB, userId },
      contactInputSchema.parse({ kind: 'company', name: 'Milik B' })
    );
    const r = await createContactAction(
      {},
      fd([['kind', 'person'], ['name', 'Penyusup'], ['companyId', String(other.id)]])
    );
    expect(r).toEqual({ error: 'Company not found' });
  });

  it('tanpa konteks toko (belum masuk) melempar error', async () => {
    ctx.current = null;
    await expect(createContactAction({}, fd([['kind', 'person'], ['name', 'X']]))).rejects.toThrow('not authenticated');
  });
});

describe('updateContactAction', () => {
  it('mengubah kontak dan mengganti tag dari beberapa nilai tagIds', async () => {
    const t1 = await createTag({ teamId: teamA, userId }, { name: 'a-satu', color: null });
    const t2 = await createTag({ teamId: teamA, userId }, { name: 'a-dua', color: null });
    const c = await createContact({ teamId: teamA, userId }, contactInputSchema.parse({ kind: 'person', name: 'Lama', tagIds: [t1.id] }));

    const r = await updateContactAction(
      {},
      fd([['id', String(c.id)], ['kind', 'person'], ['name', 'Baru'], ['isCustomer', 'on'], ['tagIds', String(t1.id)], ['tagIds', String(t2.id)]])
    );
    expect(r).toEqual({ success: 'Contact saved' });
    const got = await getContact(teamA, c.id);
    expect(got).toMatchObject({ name: 'Baru', isCustomer: true });
    expect(got?.tags.map((t) => t.name)).toEqual(['a-dua', 'a-satu']);
  });

  it('id hilang atau kontak toko lain menghasilkan Contact not found', async () => {
    expect(await updateContactAction({}, fd([['kind', 'person'], ['name', 'X']]))).toEqual({ error: 'Contact not found' });
    const other = await createContact({ teamId: teamB, userId }, contactInputSchema.parse({ kind: 'person', name: 'B' }));
    expect(await updateContactAction({}, fd([['id', String(other.id)], ['kind', 'person'], ['name', 'Dibajak']]))).toEqual({
      error: 'Contact not found',
    });
    expect((await getContact(teamB, other.id))?.name).toBe('B');
  });
});

describe('arsip dan pulihkan', () => {
  it('member ditolak di server dan kontak tidak berubah', async () => {
    const c = await createContact({ teamId: teamA, userId }, contactInputSchema.parse({ kind: 'person', name: 'Dijaga' }));
    as('member');
    expect(await archiveContactAction({}, fd([['id', String(c.id)]]))).toEqual(DENIED);
    expect((await getContact(teamA, c.id))?.archivedAt).toBeNull();
  });

  it('owner bisa mengarsipkan lalu memulihkan; member tidak bisa memulihkan', async () => {
    const c = await createContact({ teamId: teamA, userId }, contactInputSchema.parse({ kind: 'person', name: 'Bolak-balik' }));
    expect(await archiveContactAction({}, fd([['id', String(c.id)]]))).toEqual({ success: 'Contact archived' });
    expect((await getContact(teamA, c.id))?.archivedAt).not.toBeNull();

    as('member');
    expect(await restoreContactAction({}, fd([['id', String(c.id)]]))).toEqual(DENIED);

    as('owner');
    expect(await restoreContactAction({}, fd([['id', String(c.id)]]))).toEqual({ success: 'Contact restored' });
    expect((await getContact(teamA, c.id))?.archivedAt).toBeNull();
  });

  it('mengubah kontak yang diarsipkan ditolak dengan pesan', async () => {
    const c = await createContact({ teamId: teamA, userId }, contactInputSchema.parse({ kind: 'person', name: 'Diarsip' }));
    await archiveContactAction({}, fd([['id', String(c.id)]]));
    expect(await updateContactAction({}, fd([['id', String(c.id)], ['kind', 'person'], ['name', 'Ubah']]))).toEqual({
      error: 'Restore the contact before editing',
    });
  });
});

describe('createTagAction', () => {
  it('membuat tag, menolak duplikat dan nama kosong', async () => {
    expect(await createTagAction({}, fd([['name', 'Reseller']]))).toEqual({ success: 'Tag added' });
    expect(await createTagAction({}, fd([['name', 'reseller']]))).toEqual({ error: 'A tag with this name already exists' });
    expect(await createTagAction({}, fd([['name', '  ']]))).toEqual({ error: 'Tag name is required' });
  });

  it('semua anggota boleh membuat tag', async () => {
    as('member');
    expect(await createTagAction({}, fd([['name', 'Dari Member']]))).toEqual({ success: 'Tag added' });
  });
});
